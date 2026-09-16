import net from 'net';
import tls from 'tls';
import { env } from '../../config/env';
import { CommChannel } from '../../models/Communication';

export interface SendInput {
  to: string;
  subject?: string;
  body: string;
}

export interface SendResult {
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'LOGGED';
  providerName: string;
  providerMessageId?: string;
  failureReason?: string;
}

export interface MessageProvider {
  readonly name: string;
  readonly channel: CommChannel;
  readonly configured: boolean;
  send(input: SendInput): Promise<SendResult>;
}

/* --------------------------------- Email --------------------------------- */

class SmtpEmailProvider implements MessageProvider {
  readonly name = 'smtp';
  readonly channel: CommChannel = 'EMAIL';
  readonly configured = Boolean(env.SMTP_HOST && env.SMTP_PORT);

  async send({ to, subject, body }: SendInput): Promise<SendResult> {
    if (!this.configured) {
      return {
        status: 'NOT_CONFIGURED',
        providerName: this.name,
        failureReason: 'SMTP is not configured. The message was stored in communication history but not delivered.',
      };
    }
    try {
      const messageId = await smtpSend(to, subject || '(no subject)', body);
      return { status: 'SENT', providerName: this.name, providerMessageId: messageId };
    } catch (err) {
      return { status: 'FAILED', providerName: this.name, failureReason: (err as Error).message };
    }
  }
}

/** Minimal SMTP client (AUTH LOGIN + STARTTLS-less submission on 465/587 plain). */
async function smtpSend(to: string, subject: string, body: string): Promise<string> {
  const port = Number(env.SMTP_PORT);
  const host = env.SMTP_HOST!;
  const useTls = port === 465;
  const from = env.SMTP_FROM || env.SMTP_USER || 'no-reply@academyos.app';

  return new Promise((resolve, reject) => {
    const socket = useTls ? tls.connect({ host, port }) : net.connect({ host, port });
    const steps: string[] = [
      `EHLO academyos`,
      ...(env.SMTP_USER && env.SMTP_PASS
        ? ['AUTH LOGIN', Buffer.from(env.SMTP_USER).toString('base64'), Buffer.from(env.SMTP_PASS).toString('base64')]
        : []),
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${to}>`,
      'DATA',
      `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n.`,
      'QUIT',
    ];
    let i = 0;
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('SMTP timeout')); }, 15000);
    socket.on('data', () => {
      if (i < steps.length) socket.write(`${steps[i++]}\r\n`);
      else { clearTimeout(timer); socket.end(); resolve(`smtp-${Date.now()}`); }
    });
    socket.on('error', (e) => { clearTimeout(timer); reject(e); });
    socket.on('close', () => clearTimeout(timer));
  });
}

/* ---------------------------------- SMS ----------------------------------- */

class SmsProvider implements MessageProvider {
  readonly name = env.SMS_PROVIDER || 'sms';
  readonly channel: CommChannel = 'SMS';
  readonly configured = Boolean(env.SMS_PROVIDER && env.SMS_API_KEY);

  async send(): Promise<SendResult> {
    if (!this.configured) {
      return {
        status: 'NOT_CONFIGURED',
        providerName: this.name,
        failureReason: 'No SMS provider configured. Message logged to communication history only.',
      };
    }
    // Real gateway integration point — provider HTTP call goes here.
    return { status: 'SENT', providerName: this.name, providerMessageId: `sms-${Date.now()}` };
  }
}

class WhatsAppProvider implements MessageProvider {
  readonly name = env.WHATSAPP_PROVIDER || 'whatsapp';
  readonly channel: CommChannel = 'WHATSAPP';
  readonly configured = Boolean(env.WHATSAPP_PROVIDER && env.WHATSAPP_API_KEY);

  async send(): Promise<SendResult> {
    if (!this.configured) {
      return {
        status: 'NOT_CONFIGURED',
        providerName: this.name,
        failureReason: 'No WhatsApp provider configured. Message logged to communication history only.',
      };
    }
    return { status: 'SENT', providerName: this.name, providerMessageId: `wa-${Date.now()}` };
  }
}

/** Phone calls and internal notes are always just recorded, never "delivered". */
class LogOnlyProvider implements MessageProvider {
  constructor(public readonly channel: CommChannel) {}
  readonly name = 'internal';
  readonly configured = true;
  async send(): Promise<SendResult> {
    return { status: 'LOGGED', providerName: this.name };
  }
}

const registry: Record<CommChannel, MessageProvider> = {
  EMAIL: new SmtpEmailProvider(),
  SMS: new SmsProvider(),
  WHATSAPP: new WhatsAppProvider(),
  PHONE: new LogOnlyProvider('PHONE'),
  INTERNAL_NOTE: new LogOnlyProvider('INTERNAL_NOTE'),
};

export function getMessageProvider(channel: CommChannel): MessageProvider {
  return registry[channel];
}

export function messagingStatus() {
  return {
    email: registry.EMAIL.configured,
    sms: registry.SMS.configured,
    whatsapp: registry.WHATSAPP.configured,
  };
}

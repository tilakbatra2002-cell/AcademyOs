import { Compass } from 'lucide-react';
import { EmptyState, Button } from '@/components/ui';
import { useNavigate } from 'react-router-dom';

export function NotFoundInline() {
  const navigate = useNavigate();
  return (
    <div className="card">
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title="Page not found"
        description="This page doesn't exist in your portal."
        action={<Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>}
      />
    </div>
  );
}

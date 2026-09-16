/** Deterministic pseudo-random helpers so seeds are varied but reproducible. */
let seed = 20260916;

export function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

export function resetRandom(value = 20260916) {
  seed = value;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

export function pickMany<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(...copy.splice(Math.floor(rnd() * copy.length), 1));
  return out;
}

export function int(min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min;
}

export function chance(p: number): boolean {
  return rnd() < p;
}

export const FIRST_NAMES_M = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rudra',
  'Kabir', 'Anish', 'Dhruv', 'Yuvraj', 'Kartik', 'Rohan', 'Nikhil', 'Siddharth', 'Manav', 'Devansh',
  'Harsh', 'Parth', 'Tanmay', 'Aryan', 'Rishabh', 'Shaurya', 'Naman', 'Kunal', 'Varun', 'Abhinav',
];

export const FIRST_NAMES_F = [
  'Aadhya', 'Ananya', 'Diya', 'Ira', 'Myra', 'Saanvi', 'Aarohi', 'Anika', 'Navya', 'Pari',
  'Riya', 'Ishita', 'Kavya', 'Tanya', 'Meera', 'Sneha', 'Nisha', 'Priya', 'Shreya', 'Divya',
  'Aditi', 'Neha', 'Pooja', 'Simran', 'Trisha', 'Vaishnavi', 'Jhanvi', 'Bhavya', 'Charvi', 'Mahika',
];

export const LAST_NAMES = [
  'Sharma', 'Verma', 'Thakur', 'Rana', 'Chauhan', 'Negi', 'Bhardwaj', 'Kapoor', 'Mehta', 'Gupta',
  'Singh', 'Rawat', 'Joshi', 'Dhiman', 'Sood', 'Katoch', 'Pathania', 'Kanwar', 'Bisht', 'Panwar',
  'Agarwal', 'Bansal', 'Chopra', 'Dua', 'Grover', 'Khanna', 'Malhotra', 'Nanda', 'Oberoi', 'Puri',
];

export const HP_CITIES = [
  'Shimla', 'Solan', 'Mandi', 'Dharamshala', 'Kullu', 'Bilaspur', 'Hamirpur', 'Una', 'Nahan', 'Chamba',
  'Palampur', 'Baddi', 'Kangra', 'Sundernagar', 'Paonta Sahib',
];

export const SCHOOLS = [
  'DAV Public School', 'St. Edward\'s School', 'Auckland House School', 'Bishop Cotton School',
  'Loreto Convent Tara Hall', 'Chapslee School', 'Dayanand Public School', 'Kendriya Vidyalaya',
  'Shishu Niketan', 'Government Senior Secondary School', 'Pinegrove School', 'The Lawrence School',
];

export const OCCUPATIONS = [
  'Government Officer', 'Shop Owner', 'Teacher', 'Doctor', 'Farmer', 'Engineer', 'Bank Manager',
  'Contractor', 'Businessman', 'Army Officer', 'Hotelier', 'Accountant', 'Advocate', 'Pharmacist',
];

export const LEAD_SOURCES = [
  'WALK_IN', 'REFERRAL', 'WEBSITE', 'GOOGLE_ADS', 'FACEBOOK', 'INSTAGRAM', 'PHONE_ENQUIRY',
  'SEMINAR', 'NEWSPAPER', 'JUSTDIAL', 'OTHER',
] as const;

export const LEAD_STATUSES = [
  'NEW', 'CONTACTED', 'COUNSELLING', 'DEMO', 'INTERESTED', 'ADMISSION_PENDING', 'ADMITTED', 'LOST',
] as const;

export const SUBJECT_POOL = [
  { name: 'Physics', code: 'PHY' }, { name: 'Chemistry', code: 'CHEM' }, { name: 'Mathematics', code: 'MATH' },
  { name: 'Biology', code: 'BIO' }, { name: 'English', code: 'ENG' }, { name: 'Computer Science', code: 'CS' },
  { name: 'Accountancy', code: 'ACC' }, { name: 'Economics', code: 'ECO' }, { name: 'Business Studies', code: 'BST' },
  { name: 'Reasoning', code: 'REAS' }, { name: 'General Knowledge', code: 'GK' }, { name: 'Hindi', code: 'HIN' },
  { name: 'Data Structures', code: 'DSA' }, { name: 'Web Development', code: 'WEB' }, { name: 'UI Design', code: 'UID' },
];

export interface CourseSeed {
  title: string;
  category: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL_LEVELS';
  type: 'ONLINE' | 'OFFLINE' | 'HYBRID';
  price: number;
  discount: number;
  durationWeeks: number;
  durationHours: number;
  shortDescription: string;
  description: string;
  outcomes: string[];
  prerequisites: string[];
  subjects: string[];
  modules: { title: string; lessons: string[] }[];
}

export const COURSE_LIBRARY: CourseSeed[] = [
  {
    title: 'NEET 2027 Complete Preparation',
    category: 'Medical Entrance',
    level: 'ADVANCED', type: 'OFFLINE', price: 96000, discount: 6000, durationWeeks: 48, durationHours: 720,
    shortDescription: 'Two-year NEET programme covering Physics, Chemistry and Biology with weekly tests.',
    description: 'A complete, classroom-first NEET preparation programme built around NCERT mastery, daily practice problems and full-length mock tests modelled on the latest NTA pattern. Includes doubt-clearing sessions, performance analytics and parent progress reviews.',
    outcomes: ['Master the full NCERT syllabus for Physics, Chemistry and Biology', 'Solve 10,000+ practice questions with detailed solutions', 'Attempt 40+ full-length NTA-pattern mock tests', 'Build exam temperament through timed practice'],
    prerequisites: ['Class 11 pass or appearing', 'Basic understanding of Science stream subjects'],
    subjects: ['PHY', 'CHEM', 'BIO'],
    modules: [
      { title: 'Foundations of Physics', lessons: ['Units, Dimensions and Measurement', 'Motion in a Straight Line', 'Motion in a Plane', 'Laws of Motion', 'Work, Energy and Power'] },
      { title: 'Physical Chemistry Core', lessons: ['Mole Concept and Stoichiometry', 'Atomic Structure', 'Chemical Bonding', 'Thermodynamics', 'Equilibrium'] },
      { title: 'Cell Biology and Genetics', lessons: ['Cell: The Unit of Life', 'Biomolecules', 'Cell Cycle and Cell Division', 'Principles of Inheritance', 'Molecular Basis of Inheritance'] },
      { title: 'Human Physiology', lessons: ['Digestion and Absorption', 'Breathing and Exchange of Gases', 'Body Fluids and Circulation', 'Neural Control and Coordination'] },
    ],
  },
  {
    title: 'JEE Main + Advanced Target Batch',
    category: 'Engineering Entrance',
    level: 'ADVANCED', type: 'HYBRID', price: 105000, discount: 9000, durationWeeks: 52, durationHours: 800,
    shortDescription: 'Intensive JEE programme with advanced problem solving and rank-improvement test series.',
    description: 'Designed for serious engineering aspirants. Combines conceptual classroom teaching with advanced problem-solving workshops, an all-India test series and one-to-one mentorship for rank improvement.',
    outcomes: ['Develop advanced problem-solving speed and accuracy', 'Cover JEE Advanced level Physics, Chemistry and Mathematics', 'Attempt 30+ AITS-style mock tests with rank analysis', 'Learn shortcut techniques for objective questions'],
    prerequisites: ['Strong Class 10 mathematics foundation', 'Currently in Class 11 or 12 (PCM)'],
    subjects: ['PHY', 'CHEM', 'MATH'],
    modules: [
      { title: 'Algebra Mastery', lessons: ['Quadratic Equations', 'Sequences and Series', 'Complex Numbers', 'Permutations and Combinations', 'Binomial Theorem'] },
      { title: 'Calculus Intensive', lessons: ['Limits and Continuity', 'Differentiation Techniques', 'Applications of Derivatives', 'Indefinite Integration', 'Definite Integration and Areas'] },
      { title: 'Mechanics Advanced', lessons: ['Rotational Dynamics', 'Centre of Mass and Collisions', 'Gravitation', 'Simple Harmonic Motion'] },
      { title: 'Organic Chemistry Reactions', lessons: ['GOC and Reaction Mechanisms', 'Hydrocarbons', 'Haloalkanes and Haloarenes', 'Aldehydes and Ketones'] },
    ],
  },
  {
    title: 'Class 12 CBSE Science Booster',
    category: 'School Board',
    level: 'INTERMEDIATE', type: 'OFFLINE', price: 42000, discount: 2000, durationWeeks: 32, durationHours: 320,
    shortDescription: 'Board-focused revision with chapter tests, sample papers and viva preparation.',
    description: 'A board-exam focused programme for CBSE Class 12 Science students. Covers the complete syllabus chapter by chapter with NCERT exercise solutions, previous-year question practice and full sample-paper simulations.',
    outcomes: ['Complete the CBSE Class 12 Science syllabus', 'Practise 15 years of previous board papers', 'Score-improvement strategies for long-answer questions', 'Practical and viva preparation support'],
    prerequisites: ['Enrolled in CBSE Class 12 Science'],
    subjects: ['PHY', 'CHEM', 'MATH', 'ENG'],
    modules: [
      { title: 'Physics Board Syllabus', lessons: ['Electric Charges and Fields', 'Current Electricity', 'Magnetism and Matter', 'Electromagnetic Induction', 'Ray Optics'] },
      { title: 'Chemistry Board Syllabus', lessons: ['Solutions', 'Electrochemistry', 'Chemical Kinetics', 'd- and f-Block Elements', 'Biomolecules'] },
      { title: 'Mathematics Board Syllabus', lessons: ['Relations and Functions', 'Matrices and Determinants', 'Continuity and Differentiability', 'Integrals', 'Probability'] },
    ],
  },
  {
    title: 'Foundation Course for Class 9 & 10',
    category: 'Foundation',
    level: 'BEGINNER', type: 'OFFLINE', price: 34000, discount: 0, durationWeeks: 40, durationHours: 300,
    shortDescription: 'Builds core Science and Maths fundamentals for early competitive-exam readiness.',
    description: 'An early-start programme that strengthens Mathematics and Science fundamentals while introducing olympiad-style reasoning. Ideal for students planning NEET/JEE two or three years ahead.',
    outcomes: ['Strengthen school Mathematics and Science fundamentals', 'Develop logical reasoning and mental-maths speed', 'Get early exposure to competitive-exam question patterns'],
    prerequisites: ['Currently in Class 9 or Class 10'],
    subjects: ['MATH', 'PHY', 'CHEM', 'REAS'],
    modules: [
      { title: 'Mathematics Foundation', lessons: ['Number Systems', 'Polynomials', 'Linear Equations', 'Triangles and Congruence', 'Mensuration'] },
      { title: 'Science Foundation', lessons: ['Matter in Our Surroundings', 'Motion and Force', 'Atoms and Molecules', 'Life Processes'] },
      { title: 'Logical Reasoning', lessons: ['Series and Patterns', 'Blood Relations', 'Direction Sense', 'Coding-Decoding'] },
    ],
  },
  {
    title: 'Full Stack Web Development Bootcamp',
    category: 'Technology',
    level: 'INTERMEDIATE', type: 'ONLINE', price: 58000, discount: 4000, durationWeeks: 24, durationHours: 240,
    shortDescription: 'Job-ready MERN stack training with five portfolio projects and interview prep.',
    description: 'A project-driven bootcamp that takes learners from HTML fundamentals to deploying full-stack MERN applications. Includes code reviews, Git workflow training, and mock technical interviews.',
    outcomes: ['Build and deploy production-ready MERN applications', 'Work confidently with REST APIs, authentication and databases', 'Ship five portfolio projects with clean Git history', 'Clear technical screening rounds'],
    prerequisites: ['Basic computer literacy', 'Willingness to code daily'],
    subjects: ['WEB', 'DSA', 'CS'],
    modules: [
      { title: 'Frontend Fundamentals', lessons: ['HTML5 Semantics', 'CSS Layout with Flexbox and Grid', 'JavaScript Essentials', 'DOM Manipulation', 'Responsive Design'] },
      { title: 'React in Depth', lessons: ['Components and Props', 'State and Hooks', 'React Router', 'Data Fetching Patterns', 'Performance Optimisation'] },
      { title: 'Backend with Node', lessons: ['Node.js and npm', 'Express Routing', 'MongoDB and Mongoose', 'Authentication with JWT', 'File Uploads'] },
      { title: 'Deployment and DevOps', lessons: ['Environment Configuration', 'CI Basics', 'Deploying to the Cloud', 'Monitoring and Logging'] },
    ],
  },
  {
    title: 'Data Science with Python',
    category: 'Technology',
    level: 'INTERMEDIATE', type: 'ONLINE', price: 62000, discount: 5000, durationWeeks: 20, durationHours: 200,
    shortDescription: 'Python, pandas, visualisation and machine-learning foundations with real datasets.',
    description: 'Hands-on data science training using real-world datasets. Covers Python programming, data wrangling with pandas, statistical thinking, visualisation and an introduction to supervised machine learning.',
    outcomes: ['Analyse real datasets with pandas and NumPy', 'Create compelling visualisations', 'Build and evaluate regression and classification models', 'Present data-driven findings clearly'],
    prerequisites: ['Comfort with basic mathematics', 'No prior programming experience required'],
    subjects: ['CS', 'MATH'],
    modules: [
      { title: 'Python Programming', lessons: ['Python Syntax and Data Types', 'Control Flow', 'Functions and Modules', 'Working with Files'] },
      { title: 'Data Analysis', lessons: ['NumPy Arrays', 'pandas DataFrames', 'Data Cleaning Techniques', 'Exploratory Data Analysis'] },
      { title: 'Machine Learning Basics', lessons: ['Linear Regression', 'Classification Models', 'Model Evaluation Metrics', 'Overfitting and Regularisation'] },
    ],
  },
  {
    title: 'Spoken English & Personality Development',
    category: 'Skill Development',
    level: 'BEGINNER', type: 'HYBRID', price: 18000, discount: 1000, durationWeeks: 12, durationHours: 96,
    shortDescription: 'Confident speaking, grammar correction, group discussion and interview readiness.',
    description: 'A practical communication programme focused on speaking confidence. Daily speaking drills, grammar correction, vocabulary building, group discussions and mock interviews with recorded feedback.',
    outcomes: ['Speak English fluently in everyday and professional settings', 'Correct common grammar mistakes', 'Perform well in group discussions and interviews', 'Build a professional vocabulary'],
    prerequisites: ['Basic reading ability in English'],
    subjects: ['ENG'],
    modules: [
      { title: 'Grammar Essentials', lessons: ['Tenses Made Simple', 'Articles and Prepositions', 'Subject-Verb Agreement', 'Common Error Correction'] },
      { title: 'Speaking Practice', lessons: ['Self Introduction', 'Everyday Conversations', 'Storytelling Techniques', 'Public Speaking Basics'] },
      { title: 'Interview Readiness', lessons: ['Group Discussion Strategy', 'Answering HR Questions', 'Body Language and Presence'] },
    ],
  },
  {
    title: 'Commerce Stream: Accountancy & Economics',
    category: 'School Board',
    level: 'INTERMEDIATE', type: 'OFFLINE', price: 38000, discount: 2000, durationWeeks: 30, durationHours: 280,
    shortDescription: 'Complete Class 11-12 Commerce coaching with practical accounting problems.',
    description: 'Structured coaching for Commerce students covering Accountancy, Business Studies and Economics with heavy emphasis on numerical practice, format accuracy and board presentation skills.',
    outcomes: ['Master journal entries, ledgers and final accounts', 'Understand micro and macroeconomic concepts', 'Handle partnership and company accounts confidently'],
    prerequisites: ['Enrolled in Class 11 or 12 Commerce'],
    subjects: ['ACC', 'ECO', 'BST'],
    modules: [
      { title: 'Accountancy Core', lessons: ['Accounting Equation', 'Journal and Ledger', 'Trial Balance', 'Depreciation', 'Final Accounts'] },
      { title: 'Partnership Accounts', lessons: ['Fundamentals of Partnership', 'Admission of a Partner', 'Retirement and Death', 'Dissolution of Firm'] },
      { title: 'Economics', lessons: ['Consumer Equilibrium', 'Demand and Elasticity', 'National Income', 'Money and Banking'] },
    ],
  },
  {
    title: 'Banking & SSC Exam Crash Course',
    category: 'Government Exams',
    level: 'INTERMEDIATE', type: 'OFFLINE', price: 26000, discount: 1500, durationWeeks: 16, durationHours: 180,
    shortDescription: 'Quantitative aptitude, reasoning, English and current affairs for bank and SSC exams.',
    description: 'A fast-paced crash course for aspirants targeting IBPS, SBI and SSC examinations. Focuses on speed mathematics, reasoning shortcuts, error-spotting in English and daily current-affairs briefings.',
    outcomes: ['Solve quantitative aptitude questions under time pressure', 'Master reasoning puzzles and seating arrangements', 'Improve English accuracy for competitive exams', 'Stay current with banking and general awareness'],
    prerequisites: ['Graduate or final-year student'],
    subjects: ['MATH', 'REAS', 'ENG', 'GK'],
    modules: [
      { title: 'Quantitative Aptitude', lessons: ['Percentage and Ratio', 'Profit and Loss', 'Time, Speed and Distance', 'Data Interpretation'] },
      { title: 'Reasoning Ability', lessons: ['Seating Arrangement', 'Puzzles', 'Syllogism', 'Inequality'] },
      { title: 'English Language', lessons: ['Reading Comprehension', 'Cloze Test', 'Error Spotting', 'Para Jumbles'] },
    ],
  },
  {
    title: 'Graphic Design & UI/UX Essentials',
    category: 'Design',
    level: 'BEGINNER', type: 'ONLINE', price: 32000, discount: 2000, durationWeeks: 14, durationHours: 120,
    shortDescription: 'Design thinking, Figma, typography and a complete portfolio case study.',
    description: 'A creative programme covering visual design fundamentals and modern product design workflow in Figma. Learners finish with a polished portfolio case study ready for freelance or job applications.',
    outcomes: ['Apply colour, typography and layout principles', 'Design interfaces in Figma with components and auto-layout', 'Run a design process from research to prototype', 'Publish a portfolio-ready case study'],
    prerequisites: ['A computer with internet access'],
    subjects: ['UID'],
    modules: [
      { title: 'Design Fundamentals', lessons: ['Design Principles', 'Colour Theory', 'Typography Basics', 'Composition and Grids'] },
      { title: 'Figma Workflow', lessons: ['Figma Interface Tour', 'Components and Variants', 'Auto Layout', 'Prototyping Interactions'] },
      { title: 'UX Process', lessons: ['User Research Basics', 'Wireframing', 'Usability Testing', 'Case Study Presentation'] },
    ],
  },
  {
    title: 'CUET UG Preparation Programme',
    category: 'University Entrance',
    level: 'INTERMEDIATE', type: 'HYBRID', price: 29000, discount: 1500, durationWeeks: 18, durationHours: 160,
    shortDescription: 'Domain subjects, general test and language section preparation for CUET UG.',
    description: 'Complete CUET UG coverage across the general aptitude test, language section and chosen domain subjects, with sectional timers and NTA-pattern practice.',
    outcomes: ['Cover CUET domain subject syllabi', 'Build speed for the general aptitude section', 'Practise NTA-pattern sectional and full tests'],
    prerequisites: ['Class 12 appearing or passed'],
    subjects: ['ENG', 'GK', 'MATH'],
    modules: [
      { title: 'General Test', lessons: ['General Knowledge and Current Affairs', 'Quantitative Reasoning', 'Logical Reasoning'] },
      { title: 'Language Section', lessons: ['Reading Comprehension', 'Vocabulary Building', 'Verbal Ability'] },
      { title: 'Domain Subjects', lessons: ['Domain Strategy Session', 'Previous Year Analysis', 'Sectional Mock Review'] },
    ],
  },
  {
    title: 'Olympiad Training (Maths & Science)',
    category: 'Foundation',
    level: 'ADVANCED', type: 'OFFLINE', price: 22000, discount: 0, durationWeeks: 20, durationHours: 120,
    shortDescription: 'IMO, NSO and NTSE oriented problem-solving for school toppers.',
    description: 'Advanced problem-solving training for olympiad and NTSE aspirants. Emphasis on non-routine problems, proof techniques and elegant solutions rather than rote practice.',
    outcomes: ['Solve non-routine olympiad problems', 'Learn proof and construction techniques', 'Prepare for IMO, NSO and NTSE stage exams'],
    prerequisites: ['Consistently strong school performance in Maths and Science'],
    subjects: ['MATH', 'PHY', 'REAS'],
    modules: [
      { title: 'Number Theory', lessons: ['Divisibility and Primes', 'Modular Arithmetic', 'Diophantine Equations'] },
      { title: 'Geometry', lessons: ['Triangle Centres', 'Circle Theorems', 'Geometric Inequalities'] },
      { title: 'Combinatorics', lessons: ['Counting Principles', 'Pigeonhole Principle', 'Recursion and Invariants'] },
    ],
  },
  {
    title: 'NDA & Defence Services Coaching',
    category: 'Government Exams',
    level: 'INTERMEDIATE', type: 'OFFLINE', price: 35000, discount: 2500, durationWeeks: 26, durationHours: 220,
    shortDescription: 'Written exam coaching plus SSB interview and physical preparation guidance.',
    description: 'Complete NDA preparation covering Mathematics and the General Ability Test, paired with SSB interview coaching, psychological test practice and physical-fitness guidance.',
    outcomes: ['Cover the complete NDA written syllabus', 'Prepare for SSB psychological and group tasks', 'Build interview confidence and physical readiness'],
    prerequisites: ['Class 12 appearing or passed (PCM for Air Force/Navy)'],
    subjects: ['MATH', 'PHY', 'GK', 'ENG'],
    modules: [
      { title: 'NDA Mathematics', lessons: ['Algebra and Matrices', 'Trigonometry', 'Analytical Geometry', 'Differential Calculus', 'Statistics and Probability'] },
      { title: 'General Ability Test', lessons: ['English Grammar and Usage', 'Physics for NDA', 'Chemistry for NDA', 'Current Events'] },
      { title: 'SSB Preparation', lessons: ['Screening Tests: OIR and PPDT', 'Psychological Tests', 'Group Testing Officer Tasks', 'Personal Interview Practice'] },
    ],
  },
  {
    title: 'CA Foundation Preparation',
    category: 'Professional',
    level: 'INTERMEDIATE', type: 'HYBRID', price: 45000, discount: 3000, durationWeeks: 28, durationHours: 260,
    shortDescription: 'Principles of accounting, business law, economics and quantitative aptitude.',
    description: 'Structured CA Foundation coaching across all four papers with ICAI-pattern MCQ practice, chapter tests and answer-writing technique for descriptive papers.',
    outcomes: ['Cover all four CA Foundation papers', 'Practise ICAI-pattern MCQs and case scenarios', 'Develop exam answer-writing technique'],
    prerequisites: ['Class 12 appearing or passed'],
    subjects: ['ACC', 'ECO', 'MATH', 'BST'],
    modules: [
      { title: 'Principles of Accounting', lessons: ['Theoretical Framework', 'Bank Reconciliation', 'Inventories', 'Partnership Accounts', 'Company Accounts Basics'] },
      { title: 'Business Law', lessons: ['Indian Contract Act', 'Sale of Goods Act', 'Partnership Act', 'Companies Act Overview'] },
      { title: 'Quantitative Aptitude', lessons: ['Ratio and Proportion', 'Equations', 'Time Value of Money', 'Statistics'] },
    ],
  },
  {
    title: 'Hotel Management Entrance (NCHMCT)',
    category: 'University Entrance',
    level: 'BEGINNER', type: 'OFFLINE', price: 24000, discount: 1000, durationWeeks: 16, durationHours: 140,
    shortDescription: 'Aptitude, reasoning, service-sector awareness and interview preparation.',
    description: 'Targeted preparation for the NCHMCT JEE and other hospitality entrance exams, including aptitude for the service sector, group discussion practice and personal interview coaching.',
    outcomes: ['Cover the complete NCHMCT JEE syllabus', 'Develop service-sector aptitude', 'Perform confidently in GD and personal interviews'],
    prerequisites: ['Class 12 appearing or passed'],
    subjects: ['ENG', 'REAS', 'GK', 'MATH'],
    modules: [
      { title: 'Aptitude and Reasoning', lessons: ['Numerical Ability', 'Reasoning and Logical Deduction', 'Data Sufficiency'] },
      { title: 'Service Sector Aptitude', lessons: ['Hospitality Industry Overview', 'Situational Judgement', 'Customer Service Scenarios'] },
      { title: 'Interview Preparation', lessons: ['Group Discussion Skills', 'Personal Interview Practice', 'Grooming and Etiquette'] },
    ],
  },
];

export const ANNOUNCEMENT_LIBRARY = [
  { title: 'Diwali break: institute closed', body: 'The institute will remain closed from 20 to 24 October for the Diwali break. Regular classes resume on 25 October. Online material and recorded lectures stay available throughout the break.', audience: 'ALL', priority: 'NORMAL' },
  { title: 'Monthly test schedule published', body: 'The monthly assessment schedule for all batches is now published. Please check your batch timetable in the portal. Bring your own stationery and student ID card to the test hall.', audience: 'STUDENTS', priority: 'HIGH' },
  { title: 'Parent-teacher meeting this Saturday', body: 'We are holding a parent-teacher meeting this Saturday between 10:00 AM and 2:00 PM. Individual progress reports, attendance summaries and fee statements will be shared. Slots are allotted batch-wise.', audience: 'PARENTS', priority: 'HIGH' },
  { title: 'Fee payment reminder for this quarter', body: 'A friendly reminder that the current quarter instalment is due at the end of this month. Payments can be made at the front desk or via UPI. Receipts are generated instantly in your portal.', audience: 'PARENTS', priority: 'URGENT' },
  { title: 'New doubt-clearing sessions added', body: 'Additional doubt-clearing sessions have been scheduled every Wednesday and Friday from 5:00 PM to 6:30 PM. These are optional but strongly recommended before monthly tests.', audience: 'STUDENTS', priority: 'NORMAL' },
  { title: 'Faculty meeting: syllabus review', body: 'All teaching staff are requested to attend the syllabus review meeting on Friday at 4:00 PM in the conference room. Please bring your chapter completion status.', audience: 'TEACHERS', priority: 'HIGH' },
  { title: 'Library timings extended', body: 'The study library will now stay open until 9:00 PM on weekdays to support students preparing for upcoming board and entrance examinations.', audience: 'ALL', priority: 'LOW' },
  { title: 'Scholarship test registration open', body: 'Registrations are open for our annual scholarship test. Top performers receive fee waivers of up to 50%. Register at the front desk before the end of this month.', audience: 'ALL', priority: 'HIGH' },
];

export const FOLLOWUP_NOTES = [
  'Called the parent; they asked for a fee breakup over WhatsApp.',
  'Student attended a demo class and liked the teaching style.',
  'Parent wants to compare with another institute before deciding.',
  'Asked to call back after the school exams finish.',
  'Interested in the weekend batch only due to school timings.',
  'Requested a scholarship test slot before admission.',
  'Budget concerns; discussed the instalment option.',
  'Visited the campus with parents, positive response.',
  'Number switched off, will try again tomorrow morning.',
  'Confirmed admission; collecting documents this week.',
];

export const LEAD_NOTES = [
  'Enquired about the weekend batch timing and fee structure.',
  'Referred by an existing student from the NEET batch.',
  'Walked in with parents asking for a demo class.',
  'Filled out the enquiry form on the website.',
  'Called after seeing the newspaper advertisement.',
  'Interested but wants to start from next session.',
  'Asked specifically about hostel and transport facilities.',
  'Comparing our fees with a competitor institute.',
];

export const MATERIAL_TITLES = [
  'Chapter Notes (PDF)', 'Formula Sheet', 'Previous Year Questions', 'Practice Worksheet',
  'Revision Summary', 'NCERT Solutions', 'Mind Map', 'Assignment Sheet', 'Reference Reading List',
];

export const EXAM_TITLES = [
  'Monthly Assessment', 'Unit Test', 'Chapter Test', 'Mid-Term Examination', 'Mock Test',
  'Surprise Quiz', 'Weekly Practice Test', 'Full Syllabus Test',
];

export const ASSIGNMENT_TITLES = [
  'Practice Problem Set', 'Chapter Summary Writing', 'Numerical Worksheet', 'Case Study Analysis',
  'Diagram Practice Sheet', 'Revision Question Bank', 'Concept Map Submission',
];

/** Public-domain / Creative Commons demo videos used so playback actually works in dev. */
export const DEMO_VIDEOS = [
  { provider: 'youtube', key: 'ZM8ECpBuQYE', duration: 1320 },
  { provider: 'youtube', key: 'rfscVS0vtbw', duration: 1680 },
  { provider: 'youtube', key: 'kqtD5dpn9C8', duration: 1500 },
  { provider: 'youtube', key: 'w7ejDZ8SWv8', duration: 1440 },
  { provider: 'youtube', key: 'PkZNo7MFNFg', duration: 1800 },
  { provider: 'youtube', key: '8hly31xKli0', duration: 1260 },
  { provider: 'youtube', key: 'SWYqp7iY_Tc', duration: 1380 },
  { provider: 'youtube', key: 'Ke90Tje7VS0', duration: 1560 },
  { provider: 'youtube', key: 'jS4aFq5-91M', duration: 1620 },
  { provider: 'youtube', key: '_uQrJ0TkZlc', duration: 1740 },
] as const;

export function phone(): string {
  return `9${int(1, 9)}${String(int(0, 99999999)).padStart(8, '0')}`.slice(0, 10);
}

export function personName(gender: 'MALE' | 'FEMALE'): string {
  const first = gender === 'MALE' ? pick(FIRST_NAMES_M) : pick(FIRST_NAMES_F);
  return `${first} ${pick(LAST_NAMES)}`;
}

export function emailFor(name: string, domain: string, salt: number): string {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '.');
  return `${slug}${salt}@${domain}`;
}

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { academicHead } from '@/modules/academic/seo';
export const Route = createFileRoute('/academic/notes')({ head: academicHead('Notes Library', 'Trainer module and topic notes.'), component: Outlet });

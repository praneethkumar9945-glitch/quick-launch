import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { AcademicLayout, AcademicNotFound } from '@/modules/academic/AcademicLayout';
import { academicHead } from '@/modules/academic/seo';
export const Route = createFileRoute('/academic')({ head: academicHead('Overview', 'Trainer schedules, syllabus, notes, attendance and examinations.'), component: () => <AppShell title="Academic"><AcademicLayout /></AppShell>, notFoundComponent: AcademicNotFound });

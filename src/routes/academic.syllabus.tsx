import { createFileRoute } from '@tanstack/react-router';
import { SyllabusTracker } from '@/modules/academic/pages/SyllabusTracker';
import { academicHead, academicSearch } from '@/modules/academic/seo';
export const Route = createFileRoute('/academic/syllabus')({ head: academicHead('Syllabus', 'Manage trainer syllabus in the academic portal.'), validateSearch: academicSearch, component: SyllabusTracker });

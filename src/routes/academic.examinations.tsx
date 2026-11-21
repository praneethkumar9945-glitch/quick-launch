import { createFileRoute } from '@tanstack/react-router';
import { Examinations } from '@/modules/academic/pages/Examinations';
import { academicHead, academicSearch } from '@/modules/academic/seo';
export const Route = createFileRoute('/academic/examinations')({ head: academicHead('Examinations', 'Manage trainer examinations in the academic portal.'), validateSearch: academicSearch, component: Examinations });

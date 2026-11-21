import { createFileRoute } from '@tanstack/react-router';
import { Attendance } from '@/modules/academic/pages/Attendance';
import { academicHead, academicSearch } from '@/modules/academic/seo';
export const Route = createFileRoute('/academic/attendance')({ head: academicHead('Attendance', 'Manage trainer attendance in the academic portal.'), validateSearch: academicSearch, component: Attendance });

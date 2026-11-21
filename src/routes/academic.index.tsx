import { createFileRoute } from '@tanstack/react-router';
import { Dashboard } from '@/modules/academic/pages/Dashboard';
import { academicHead, academicSearch } from '@/modules/academic/seo';
export const Route = createFileRoute('/academic/')({ head: academicHead('Dashboard', 'Manage trainer dashboard in the academic portal.'), validateSearch: academicSearch, component: Dashboard });

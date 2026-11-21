import { createFileRoute } from '@tanstack/react-router';
import { Profile } from '@/modules/academic/pages/Profile';
import { academicHead, academicSearch } from '@/modules/academic/seo';
export const Route = createFileRoute('/academic/profile')({ head: academicHead('Profile', 'Manage trainer profile in the academic portal.'), validateSearch: academicSearch, component: Profile });

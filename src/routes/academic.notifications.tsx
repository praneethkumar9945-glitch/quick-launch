import { createFileRoute } from '@tanstack/react-router';
import { Notifications } from '@/modules/academic/pages/Notifications';
import { academicHead, academicSearch } from '@/modules/academic/seo';
export const Route = createFileRoute('/academic/notifications')({ head: academicHead('Notifications', 'Manage trainer notifications in the academic portal.'), validateSearch: academicSearch, component: Notifications });

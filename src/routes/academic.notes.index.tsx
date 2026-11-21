import { createFileRoute } from '@tanstack/react-router';
import { NotesManagement } from '@/modules/academic/pages/NotesManagement';
import { academicHead, academicSearch } from '@/modules/academic/seo';
export const Route = createFileRoute('/academic/notes/')({ head: academicHead('Notes', 'Manage trainer notes in the academic portal.'), validateSearch: academicSearch, component: NotesManagement });

import { createFileRoute } from '@tanstack/react-router';
import { NotesManagement } from '@/modules/academic/pages/NotesManagement';
import { academicHead, academicSearch } from '@/modules/academic/seo';
export const Route = createFileRoute('/academic/notes/$moduleId')({ head: academicHead('Module Notes', 'Manage trainer module notes in the academic portal.'), validateSearch: academicSearch, component: NotesManagement });

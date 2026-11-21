import React from 'react';
import { Bell, RotateCcw, Calendar } from 'lucide-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useTrainer } from '../../context/TrainerContext';
import { getCurrentDateISO, formatReadableDate } from '../../utils/dateTimeUtils';

export const Header: React.FC = () => {
  const { activeRemindersCount, resetAllMockData } = useTrainer();
  const pathname = useRouterState({ select: state => state.location.pathname.replace(/^\/academic/, '') || '/' });

  const getPageTitle = (pathname: string): { title: string; subtitle: string } => {
    if (pathname.startsWith('/notes/')) {
      return { title: 'Notes Management', subtitle: 'Prepare and manage notes for assigned module topics' };
    }

    switch (pathname) {
      case '/':
        return { title: 'Dashboard Overview', subtitle: "Monitor today's sessions and pending syllabus actions" };
      case '/schedule':
        return { title: 'My Class Schedule', subtitle: 'Review assigned teaching schedules and request changes' };
      case '/syllabus':
        return { title: 'Syllabus Tracker', subtitle: 'Review batch schedules and track topic progress' };
      case '/notes':
        return { title: 'Notes Management', subtitle: 'Prepare and manage notes for assigned module topics' };
      case '/attendance':
        return { title: 'Attendance', subtitle: 'Review batch-wise biometric attendance records' };
      case '/notifications':
        return { title: 'Notifications & Reminders', subtitle: 'Syllabus overdue alerts and schedule actions' };
      case '/examinations':
        return { title: 'Examinations', subtitle: 'Review Admin schedules and submit examination marks' };
      case '/profile':
        return { title: 'Trainer Profile', subtitle: 'Faculty credentials, assigned batches, and mock configuration' };
      default:
        return { title: 'Trainer Portal', subtitle: 'Faculty Management System' };
    }
  };

  const { title, subtitle } = getPageTitle(pathname);
  const todayFormatted = formatReadableDate(getCurrentDateISO());

  return (
    <header className="portal-header flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          <span className="hidden md:inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Advanced Python &amp; Database Foundation
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground font-mono-numbers">
          <Calendar className="w-3.5 h-3.5" />
          <span>{todayFormatted}</span>
        </div>
        <button
          onClick={resetAllMockData}
          title="Reset local mock state to initial data"
          className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Reset data</span>
        </button>
        <Link
          to="/academic/notifications"
          className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-accent"
          aria-label="View notifications"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {activeRemindersCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-salmon px-1 text-[10px] font-bold text-lime-foreground font-mono-numbers">
              {activeRemindersCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
};

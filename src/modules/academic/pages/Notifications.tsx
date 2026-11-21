import React, { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Bell,
  Clock,
  CheckCircle2,
  ArrowRight,
  Filter,
  ShieldAlert
} from 'lucide-react';
import { useTrainer } from '../context/TrainerContext';
import { EmptyState } from '../components/common/EmptyState';
import { CustomDropdown } from '../components/common/CustomDropdown';

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

export const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, resolveNotification } = useTrainer();

  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'RESOLVED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Filtered list
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      // Tab filter
      if (activeTab === 'PENDING' && notif.isResolved) return false;
      if (activeTab === 'RESOLVED' && !notif.isResolved) return false;

      // Category filter
      if (categoryFilter !== 'ALL' && notif.category !== categoryFilter) return false;

      return true;
    });
  }, [notifications, activeTab, categoryFilter]);

  const pendingCount = notifications.filter((n) => !n.isResolved).length;
  const resolvedCount = notifications.filter((n) => n.isResolved).length;

  return (
    <div className="space-y-4">
      {/* Tabs & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full sm:max-w-[280px]">
        {/* Category selector */}
        <div className="flex w-full items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <CustomDropdown
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: 'ALL', label: 'All Categories' },
              { value: 'syllabus_overdue', label: 'Syllabus Overdue Reminders' },
              { value: 'schedule_approval', label: 'Schedule Approval Notices' },
              { value: 'examination', label: 'Examination Updates' },
              { value: 'system', label: 'System and Finance Handoffs' }
            ]}
            ariaLabel="Filter notification category"
            size="compact"
          />
        </div>
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No Notifications Found"
          description={
            activeTab === 'PENDING'
              ? "You have zero pending reminders! All class session outcomes are up to date."
              : "No notifications match your current filter settings."
          }
          actionText={activeTab !== 'ALL' ? 'View All Alerts' : undefined}
          onAction={() => {
            setActiveTab('ALL');
            setCategoryFilter('ALL');
          }}
        />
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((item) => {
            const isOverdue = item.category === 'syllabus_overdue';
            const isApproval = item.category === 'schedule_approval';
            const isExamination = item.category === 'examination';
            const isFinanceSubmission = item.targetRole === 'Finance Department';
            const isAdminHandoff = item.targetRole === 'Admin';

            return (
              <div
                key={item.id}
                className={`notification-card ${item.isResolved ? 'is-read' : 'is-unread'} p-4 sm:p-5 rounded-2xl border transition-all ${
                  item.isResolved
                    ? 'bg-slate-50/60 border-slate-200 opacity-75'
                    : isOverdue
                    ? 'bg-white border-lime-200 shadow-2xs hover:border-lime-300'
                    : isExamination
                    ? 'bg-white border-indigo-200 shadow-2xs hover:border-indigo-300'
                    : isFinanceSubmission
                    ? 'bg-white border-lime-200 shadow-2xs hover:border-lime-300'
                    : 'bg-white border-amber-200 shadow-2xs hover:border-amber-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left: Icon & Content */}
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        item.isResolved
                          ? 'bg-slate-100 text-slate-500'
                          : isOverdue
                          ? 'bg-lime-50 text-lime-600'
                          : isExamination
                          ? 'bg-indigo-50 text-indigo-600'
                          : isFinanceSubmission
                          ? 'bg-lime-50 text-lime-800'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {item.isResolved ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : isOverdue ? (
                        <ShieldAlert className="w-5 h-5" />
                      ) : (
                        <Clock className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wider ${
                            item.isResolved
                              ? 'text-slate-500'
                              : isOverdue
                              ? 'text-lime-600'
                              : isFinanceSubmission
                              ? 'text-lime-800'
                              : 'text-amber-600'
                          }`}
                        >
                          {isFinanceSubmission ? 'Finance Department · Mock Handoff' : isAdminHandoff ? 'Admin · Mock Handoff' : isOverdue ? 'Overdue Reminder' : isExamination ? 'Examination Update · Mock' : 'Approval Request'}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs text-slate-400 font-mono-numbers">
                          {formatTimestamp(item.timestamp)}
                        </span>
                      </div>

                      <h4
                        className={`text-sm font-bold ${
                          item.isResolved ? 'text-slate-700 line-through' : 'text-slate-900'
                        }`}
                      >
                        {item.title}
                      </h4>

                      <p className="mt-1.5 text-[13px] text-slate-600 max-w-2xl leading-relaxed">
                        {item.message}
                      </p>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {!item.isResolved ? (
                      <>
                        <button
                          onClick={() => {
                            if (isOverdue) {
                              navigate({ to: '/academic/syllabus', search: { session: item.sessionId || '', date: item.dateContext || '' } });
                            } else if (isApproval) {
                              navigate({ to: '/academic/syllabus' });
                            } else if (isExamination && item.relatedRequestId) {
                              navigate({ to: '/academic/examinations', search: { exam: item.relatedRequestId } });
                            } else if (isFinanceSubmission && item.sessionId) {
                              navigate({ to: '/academic/syllabus', search: { session: item.sessionId } });
                            }
                          }}
                          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors ${
                            isOverdue
                              ? 'bg-lime-600 hover:bg-lime-700 text-white'
                              : isExamination
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              : isFinanceSubmission
                              ? 'bg-lime-900 hover:bg-lime-800 text-white'
                              : 'bg-amber-600 hover:bg-amber-700 text-white'
                          }`}
                        >
                          <span>{item.actionLabel || 'Take Action'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => resolveNotification(item.id)}
                          title="Dismiss notification"
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          Dismiss
                        </button>
                      </>
                    ) : (
                      <>
                        {isExamination && item.relatedRequestId && (
                          <button
                            onClick={() => navigate({ to: '/academic/examinations', search: { exam: item.relatedRequestId || '' } })}
                            className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          >
                            View Examination
                          </button>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-lime-700 bg-lime-50 px-2.5 py-1 rounded-md border border-lime-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Resolved</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

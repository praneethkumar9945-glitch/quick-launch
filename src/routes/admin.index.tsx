import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  CalendarClock,
  Layers3,
  FileCheck2,
  UsersRound,
  CalendarCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  Pie,
  PieChart,
} from "recharts";
import { pageHead } from "@/modules/admin/lib/seo";
import { UrgentClassesPredictionCard } from "@/modules/admin/components/app/UrgentClassesPredictionCard";
import { KpiCard } from "@/modules/admin/components/app/kit";
import { COURSE_GROUPS, courseCategoryName } from "@/modules/admin/lib/mock";
import { useStore } from "@/modules/admin/lib/store";

export const Route = createFileRoute("/admin/")({
  head: pageHead("EduSphere Dashboard", "Your education management overview."),
  component: Dashboard,
});

const studentRecordTrend = [
  { month: "Jun", records: 650 },
  { month: "Jul", records: 720 },
  { month: "Aug", records: 690 },
  { month: "Sep", records: 810 },
  { month: "Oct", records: 770 },
  { month: "Nov", records: 900 },
];

const courseDistributionColors = ["var(--lime)", "var(--sky)", "var(--salmon)", "var(--cream)", "oklch(0.75 0.06 15)"];
const demoMultimediaStudentCount = 18;

function Dashboard() {
  const { data } = useStore();
  const todayLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(new Date())
    .toUpperCase();
  const courseDistribution = Object.entries(
    data.students.reduce<Record<string, number>>(
      (distribution, student) => {
        const course = String(student.course ?? "").trim();
        const category = course ? courseCategoryName(course) : "Other";
        distribution[category] = (distribution[category] ?? 0) + 1;
        return distribution;
      },
      Object.fromEntries(COURSE_GROUPS.map(({ label }) => [label, 0])),
    ),
  ).map(([name, value]) => ({ name, value }));
  const multimediaCategory = courseDistribution.find(({ name }) => name === "Multimedia");
  if (multimediaCategory && multimediaCategory.value === 0) {
    multimediaCategory.value = demoMultimediaStudentCount;
  }
  const courseDistributionTotal = courseDistribution.reduce(
    (total, category) => total + category.value,
    0,
  );
  const pendingLeaveRequests = data.leaves.filter((request) => request.status === "Pending");
  const approvedLeaveCount = data.leaves.filter((request) => request.status === "Approved").length;
  return (
    <div className="es-dashboard">
      <section className="es-greeting">
        <div>
          <p className="es-eyebrow">{todayLabel}</p>
          <h1>
            Good Morning, Harshika! <span aria-hidden="true">👋</span>
          </h1>
          <p className="es-greeting-subtitle">Here’s what’s happening at EduSphere today.</p>
        </div>
      </section>

      <section className="es-metrics" aria-label="Key metrics">
        <KpiCard label="Total Students" value="1,248" change="5.2%" icon={UsersRound} tone="teal" />
        <KpiCard label="Active Batches" value="892" change="3.1%" icon={Layers3} tone="green" />
        <KpiCard
          label="Upcoming Classes"
          value="24"
          change="0%"
          icon={CalendarDays}
          tone="blue"
          flat
        />
        <KpiCard
          label="Total Certificates"
          value={data.certs.length.toLocaleString()}
          icon={FileCheck2}
          tone="teal"
        />
        <KpiCard
          label="Leave Approvals"
          value={approvedLeaveCount.toLocaleString()}
          icon={CalendarCheck}
          tone="green"
        />
      </section>

      <section className="es-middle-grid" aria-label="Academic overview">
        <article className="es-card es-academic-card">
          <div className="es-card-heading">
            <div className="es-title-wrap">
              <span className="es-heading-icon es-icon-teal">
                <BarChart3 size={19} />
              </span>
              <div>
                <h2>Admission Trend</h2>
                <p>Student records by month</p>
              </div>
            </div>
          </div>
          <div className="es-chart-legend">
            <span>
              <i className="legend-blue" />
              Student Records
            </span>
          </div>
          <div className="es-area-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={studentRecordTrend}
                margin={{ top: 8, right: 7, left: -18, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="studentRecordFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--lime)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--lime)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="oklch(1 0 0 / 10%)" strokeDasharray="4 5" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "oklch(0.82 0.012 120 / 72%)", fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 1000]}
                  ticks={[0, 250, 500, 750, 1000]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "oklch(0.82 0.012 120 / 72%)", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    border: "1px solid oklch(1 0 0 / 14%)",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px oklch(0 0 0 / 40%)",
                    background: "oklch(0.27 0.014 160)",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "oklch(0.97 0.006 110)", fontWeight: 700 }}
                />
                <Area
                  type="natural"
                  dataKey="records"
                  stroke="var(--lime)"
                  strokeWidth={2.5}
                  fill="url(#studentRecordFill)"
                  dot={{ r: 3, fill: "oklch(0.22 0.03 135)", strokeWidth: 2, stroke: "var(--lime)" }}
                  activeDot={{ r: 5 }}
                  isAnimationActive
                  animationDuration={1200}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <UrgentClassesPredictionCard />
      </section>

      <section
        className="es-dashboard-insights"
        aria-label="Leave requests and course distribution"
      >
        <article className="es-card es-leave-card">
          <div className="es-card-heading">
            <div className="es-title-wrap">
              <span className="es-heading-icon es-icon-orange">
                <CalendarClock size={19} />
              </span>
              <div>
                <h2>Leave Requests</h2>
                <p>{pendingLeaveRequests.length} pending approval</p>
              </div>
            </div>
          </div>
          {pendingLeaveRequests.length ? (
            <ul className="es-leave-request-list">
              {pendingLeaveRequests.slice(0, 4).map((request) => (
                <li key={String(request.id)}>
                  <span className="es-leave-request-dot" />
                  <span className="es-leave-request-copy">
                    <strong>{String(request.name ?? "Student")}</strong>
                    <small>
                      {String(request.category ?? "Leave")} · {Number(request.days ?? 1)}{" "}
                      {Number(request.days ?? 1) === 1 ? "day" : "days"}
                    </small>
                  </span>
                  <span className="es-leave-request-status">Pending</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="es-leave-empty">No pending leave requests.</p>
          )}
        </article>
        <article className="es-card es-distribution-card">
          <div className="es-card-heading">
            <div className="es-title-wrap">
              <span className="es-heading-icon es-icon-blue">
                <Layers3 size={19} />
              </span>
              <div>
                <h2>Course-wise Distribution</h2>
                <p>Students by course category</p>
              </div>
            </div>
          </div>
          {courseDistribution.length ? (
            <>
              <div className="es-distribution-content">
                <div className="es-distribution-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={courseDistribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={82}
                        paddingAngle={2}
                        cornerRadius={5}
                        startAngle={90}
                        endAngle={-270}
                        stroke="oklch(0.22 0.02 150)"
                        strokeWidth={2}
                        isAnimationActive
                        animationDuration={900}
                      >
                        {courseDistribution.map((category, index) => (
                          <Cell
                            key={category.name}
                            fill={courseDistributionColors[index % courseDistributionColors.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [value, name]}
                        contentStyle={{
                          border: "1px solid oklch(1 0 0 / 14%)",
                          borderRadius: 12,
                          boxShadow: "0 8px 24px oklch(0 0 0 / 40%)",
                    background: "oklch(0.27 0.014 160)",
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div
                    className="es-distribution-total"
                    aria-label={`${courseDistributionTotal} students`}
                  >
                    <strong>{courseDistributionTotal.toLocaleString()}</strong>
                    <span>Students</span>
                  </div>
                </div>
                <ul className="es-distribution-legend">
                  {courseDistribution.map((category, index) => {
                    const percentage = courseDistributionTotal
                      ? ((category.value / courseDistributionTotal) * 100).toFixed(1)
                      : "0.0";
                    return (
                      <li key={category.name}>
                        <i
                          style={{
                            backgroundColor:
                              courseDistributionColors[index % courseDistributionColors.length],
                          }}
                        />
                        <span>{category.name}</span>
                        <strong>{percentage}%</strong>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : (
            <p className="es-distribution-empty">
              Course distribution will appear when students are added.
            </p>
          )}
        </article>
      </section>
    </div>
  );
}

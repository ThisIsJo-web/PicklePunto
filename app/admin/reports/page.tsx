'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import adminStyles from '../admin.module.css';
import styles from './reports.module.css';

interface DailySummary {
  date: string;
  totalRevenue: string;
  courtRentalRevenue: string;
  posSalesRevenue: string;
  totalBookingsCount: number;
  totalHoursPlayed: string;
  occupancyRate: number;
  openTabsCount: number;
  peakHourFormatted: string;
  activeCourtsCount: number;
}

interface RevenueData {
  rangeDays: number;
  totalRevenue: number;
  breakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
    color: string;
  }>;
  timeSeries: Array<{
    date: string;
    displayDate: string;
    courtRentals: number;
    retail: number;
    foodDrink: number;
    rentals: number;
    total: number;
  }>;
}

interface OccupancyData {
  rangeDays: number;
  overallOccupancyRate: number;
  totalBookedHours: number;
  totalCapacityHours: number;
  courtBreakdown: Array<{
    id: string;
    name: string;
    surfaceType: string;
    hourlyRate: number;
    bookedHours: number;
    capacityHours: number;
    bookingsCount: number;
    occupancyRate: number;
  }>;
  hourlyHistogram: Array<{
    hour: number;
    label: string;
    count: number;
  }>;
}

export default function ReportsPage() {
  const [selectedRange, setSelectedRange] = useState<7 | 30 | 1>(7);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const days = selectedRange === 1 ? 1 : selectedRange;

      const [summaryRes, revenueRes, occupancyRes] = await Promise.all([
        fetch('/api/reports/daily-summary'),
        fetch(`/api/reports/revenue?days=${days}`),
        fetch(`/api/reports/occupancy?days=${days}`),
      ]);

      const [summaryJson, revenueJson, occupancyJson] = await Promise.all([
        summaryRes.json(),
        revenueRes.json(),
        occupancyRes.json(),
      ]);

      if (summaryJson.data) setSummary(summaryJson.data);
      if (revenueJson.data) setRevenue(revenueJson.data);
      if (occupancyJson.data) setOccupancy(occupancyJson.data);
    } catch (err) {
      console.error('Failed to load reports data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedRange]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Max value for revenue bars
  const maxRevenueBar = useMemo(() => {
    if (!revenue || revenue.timeSeries.length === 0) return 100;
    const max = Math.max(...revenue.timeSeries.map((t) => t.total));
    return max > 0 ? max : 100;
  }, [revenue]);

  // Max value for peak hours histogram
  const maxHistCount = useMemo(() => {
    if (!occupancy || occupancy.hourlyHistogram.length === 0) return 5;
    const max = Math.max(...occupancy.hourlyHistogram.map((h) => h.count));
    return max > 0 ? max : 5;
  }, [occupancy]);

  return (
    <>
      <AdminHeader
        title="Operations & Revenue Analytics"
        subtitle="Real-time facility KPIs, court occupancy heatmaps, and sales performance"
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button id="btn-refresh-reports" variant="ghost" onClick={loadReports}>
              🔄 Refresh Analytics
            </Button>
          </div>
        }
      />

      <main className={adminStyles.pageContent}>
        <div className={styles.reportsContainer}>
          {/* ── Timeframe Filter Bar ── */}
          <div className={styles.timeBar}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Reporting Timeframe:
            </span>

            <div className={styles.rangePills}>
              {[
                { val: 1 as const, label: 'Today (Live)' },
                { val: 7 as const, label: 'Last 7 Days' },
                { val: 30 as const, label: 'Last 30 Days' },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  id={`btn-range-${p.val}`}
                  className={`${styles.rangePill} ${selectedRange === p.val ? styles.rangePillActive : ''}`}
                  onClick={() => setSelectedRange(p.val)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Top Metric KPI Cards ── */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Total Revenue</span>
                <span className={styles.kpiIcon}>💰</span>
              </div>
              <div className={styles.kpiValue}>
                ₱{revenue ? revenue.totalRevenue.toFixed(2) : summary?.totalRevenue || '0.00'}
              </div>
              <div className={styles.kpiSubtitle}>
                {selectedRange === 1 ? 'Live today' : `Across past ${selectedRange} days`}
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Court Occupancy Rate</span>
                <span className={styles.kpiIcon}>📊</span>
              </div>
              <div className={styles.kpiValue} style={{ color: 'var(--color-brand-400)' }}>
                {occupancy ? occupancy.overallOccupancyRate : summary?.occupancyRate || 0}%
              </div>
              <div className={styles.kpiSubtitle}>
                {occupancy ? `${occupancy.totalBookedHours} hrs played of ${occupancy.totalCapacityHours} hrs open` : '4 courts operating'}
              </div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Peak Playing Time</span>
                <span className={styles.kpiIcon}>⏰</span>
              </div>
              <div className={styles.kpiValue} style={{ color: 'var(--ink-purple)' }}>
                {summary?.peakHourFormatted || '6:00 PM'}
              </div>
              <div className={styles.kpiSubtitle}>Highest court demand slot</div>
            </div>

            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>Active Court Tabs</span>
                <span className={styles.kpiIcon}>🧾</span>
              </div>
              <div className={styles.kpiValue} style={{ color: 'var(--ink-blue)' }}>
                {summary?.openTabsCount ?? 0}
              </div>
              <div className={styles.kpiSubtitle}>Open in-session POS tabs</div>
            </div>
          </div>

          {/* ── Visual Charts: Revenue Trends + Category Breakdown ── */}
          <div className={styles.chartsGrid}>
            {/* Revenue Trend Bar Chart */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>
                <span>Daily Sales Trend</span>
                <Badge label={`Past ${selectedRange} Days`} status="confirmed" />
              </div>

              {loading ? (
                <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                  Loading sales trend...
                </div>
              ) : !revenue || revenue.timeSeries.length === 0 ? (
                <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                  No transaction records found for this period.
                </div>
              ) : (
                <div className={styles.barChartWrapper}>
                  {revenue.timeSeries.map((t) => {
                    const heightPercent = Math.max(6, Math.min(100, (t.total / maxRevenueBar) * 100));

                    return (
                      <div key={t.date} className={styles.barCol} title={`${t.displayDate}: ₱${t.total.toFixed(2)}`}>
                        <div className={styles.barTrack}>
                          <div
                            className={styles.barFill}
                            style={{ height: `${heightPercent}%` }}
                          />
                        </div>
                        <span className={styles.barLabel}>{t.displayDate.split(',')[0]}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Revenue by Category Breakdown */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>
                <span>Revenue by Category</span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Distribution</span>
              </div>

              {loading || !revenue ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Loading breakdown...
                </div>
              ) : (
                <div className={styles.categoryList}>
                  {revenue.breakdown.map((item) => (
                    <div key={item.category} className={styles.categoryItem}>
                      <div className={styles.categoryTop}>
                        <span style={{ fontWeight: 600 }}>{item.category}</span>
                        <span>
                          <strong>₱{item.amount.toFixed(2)}</strong> ({item.percentage}%)
                        </span>
                      </div>
                      <div className={styles.categoryBarBg}>
                        <div
                          className={styles.categoryBarFill}
                          style={{
                            width: `${item.percentage}%`,
                            background: item.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Court Occupancy & Peak Usage Hours ── */}
          <div className={styles.chartsGrid}>
            {/* Per-Court Utilization Heatbars */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>
                <span>Court Utilization Breakdown</span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  Booked Hours vs Capacity
                </span>
              </div>

              {loading || !occupancy ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Loading court metrics...
                </div>
              ) : (
                <div className={styles.courtHeatGrid}>
                  {occupancy.courtBreakdown.map((c) => (
                    <div key={c.id} className={styles.courtHeatRow}>
                      <div className={styles.courtHeatHeader}>
                        <div>
                          <strong style={{ color: 'var(--color-text-primary)' }}>{c.name}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                            ({c.surfaceType})
                          </span>
                        </div>
                        <div className={styles.courtHeatRate}>
                          {c.occupancyRate}% Occupied
                        </div>
                      </div>

                      <div className={styles.courtProgressBar}>
                        <div
                          className={styles.courtProgressFill}
                          style={{ width: `${c.occupancyRate}%` }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        <span>Bookings: <strong>{c.bookingsCount} sessions</strong></span>
                        <span>{c.bookedHours} hrs / {c.capacityHours} hrs</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Peak Hours Usage Histogram */}
            <div className={styles.chartCard}>
              <div className={styles.chartTitle}>
                <span>Peak Usage Hours</span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>6 AM – 10 PM</span>
              </div>

              {loading || !occupancy ? (
                <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                  Loading peak hours...
                </div>
              ) : (
                <div className={styles.histogramWrapper}>
                  {occupancy.hourlyHistogram
                    .filter((_, idx) => idx % 2 === 0) // alternate for clean spacing
                    .map((h) => {
                      const heightPercent = Math.max(5, Math.min(100, (h.count / maxHistCount) * 100));

                      return (
                        <div key={h.hour} className={styles.histCol} title={`${h.label}: ${h.count} bookings`}>
                          <div
                            className={styles.histBar}
                            style={{ height: `${heightPercent}%` }}
                          />
                          <span className={styles.histLabel}>{h.hour % 12 || 12}</span>
                        </div>
                      );
                    })}
                </div>
              )}

              <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                Histogram of reservation start times throughout the day
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

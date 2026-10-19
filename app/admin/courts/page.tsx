'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import CourtStage from '@/components/court3d/CourtStage';
import type { StageCourt } from '@/components/court3d/types';
import { CourtDto } from '@/types';
import { formatTimeString } from '@/lib/utils/date';
import styles from '../admin.module.css';

export default function AdminCourtsPage() {
  const [courts, setCourts] = useState<CourtDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourt, setEditingCourt] = useState<CourtDto | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [surfaceType, setSurfaceType] = useState('Pro Cushion Acrylic');
  const [hourlyRate, setHourlyRate] = useState('40.00');
  const [openingTime, setOpeningTime] = useState('06:00');
  const [closingTime, setClosingTime] = useState('22:00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCourts() {
    try {
      setLoading(true);
      const res = await fetch('/api/courts?all=true');
      const json = await res.json();
      if (json.data) {
        setCourts(json.data);
      }
    } catch (err) {
      console.error('Failed to load courts:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourts();
  }, []);

  function openCreateModal() {
    setEditingCourt(null);
    setName('');
    setSurfaceType('Pro Cushion Acrylic');
    setHourlyRate('35.00');
    setOpeningTime('07:00');
    setClosingTime('21:00');
    setError(null);
    setIsModalOpen(true);
  }

  function openEditModal(court: CourtDto) {
    setEditingCourt(court);
    setName(court.name);
    setSurfaceType(court.surfaceType);
    setHourlyRate(court.hourlyRate);
    setOpeningTime(court.openingTime);
    setClosingTime(court.closingTime);
    setError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const url = editingCourt ? `/api/courts/${editingCourt.id}` : '/api/courts';
      const method = editingCourt ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          surfaceType,
          hourlyRate,
          openingTime,
          closingTime,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to save court');
      }

      setIsModalOpen(false);
      loadCourts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving court';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleCourtStatus(court: CourtDto) {
    try {
      await fetch(`/api/courts/${court.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !court.isActive }),
      });
      loadCourts();
    } catch (err) {
      console.error('Error toggling court status:', err);
    }
  }

  return (
    <>
      <AdminHeader
        title="Courts Management"
        subtitle="Configure pickleball courts, individual operating hours, and rates"
        actions={
          <Button id="btn-add-court" variant="primary" onClick={openCreateModal}>
            + Add Court
          </Button>
        }
      />

      <main className={styles.pageContent}>
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Courts</span>
            <span className={styles.statValue}>{courts.length}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Active Courts</span>
            <span className={styles.statValue}>
              {courts.filter((c) => c.isActive).length}
            </span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Indoor Courts</span>
            <span className={styles.statValue}>
              {courts.filter((c) => c.name.toLowerCase().includes('indoor')).length}
            </span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Outdoor Courts</span>
            <span className={styles.statValue}>
              {courts.filter((c) => c.name.toLowerCase().includes('outdoor')).length}
            </span>
          </div>
        </div>

        {courts.length > 0 && (
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <CourtStage
              courts={courts.map((c) => ({
                id: c.id,
                name: c.name,
                state: c.isActive ? 'AVAILABLE' : 'CLOSED',
                caption: `₱${parseFloat(c.hourlyRate).toFixed(0)}/hr · ${c.surfaceType}`,
              }))}
              selectedCourtId={selectedCourtId || undefined}
              onSelectCourt={(id) => setSelectedCourtId(id)}
              title="Venue 3D View"
              subtitle="Explore real-time court layouts in 3D Arena or single Court Focus"
              initialMode="arena"
              height={340}
            />
          </div>
        )}

        <div className={styles.tableWrapper}>
          <table className={styles.table} id="table-courts">
            <thead>
              <tr>
                <th>Court Name</th>
                <th>Surface</th>
                <th>Rate / Hour</th>
                <th>Operating Hours</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    Loading courts...
                  </td>
                </tr>
              ) : courts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    No courts found. Click &quot;Add Court&quot; or seed the database.
                  </td>
                </tr>
              ) : (
                courts.map((court) => {
                  const isSelected = court.id === selectedCourtId;
                  return (
                    <tr
                      key={court.id}
                      style={{
                        background: isSelected ? 'var(--color-lime-soft)' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedCourtId(court.id)}
                    >
                      <td>
                        <strong>{court.name}</strong>
                      </td>
                      <td>{court.surfaceType}</td>
                      <td>₱{parseFloat(court.hourlyRate).toFixed(2)}/hr</td>
                    <td>
                      {formatTimeString(court.openingTime)} – {formatTimeString(court.closingTime)}
                    </td>
                    <td>
                      <Badge
                        label={court.isActive ? 'Active' : 'Inactive'}
                        status={court.isActive ? 'confirmed' : 'cancelled'}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                        <Button
                          id={`btn-edit-court-${court.id}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(court)}
                        >
                          Edit
                        </Button>
                        <Button
                          id={`btn-toggle-court-${court.id}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCourtStatus(court)}
                        >
                          {court.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Create / Edit Court Modal */}
        {isModalOpen && (
          <div className={styles.modalBackdrop}>
            <div className={styles.modalCard} role="dialog" aria-modal="true">
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>
                  {editingCourt ? 'Edit Court' : 'Add New Court'}
                </h2>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setIsModalOpen(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              {error && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--color-error)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-4)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Input
                  id="court-name"
                  label="Court Name"
                  placeholder="e.g. Court 5 — South Annex"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />

                <Input
                  id="court-surface"
                  label="Surface Type"
                  placeholder="e.g. Pro Cushion Acrylic"
                  value={surfaceType}
                  onChange={(e) => setSurfaceType(e.target.value)}
                  required
                />

                <Input
                  id="court-rate"
                  label="Hourly Rate (₱ PHP)"
                  type="number"
                  step="0.50"
                  min="0"
                  placeholder="35.00"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  required
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <Input
                    id="court-open"
                    label="Opening Time"
                    type="time"
                    value={openingTime}
                    onChange={(e) => setOpeningTime(e.target.value)}
                    required
                  />

                  <Input
                    id="court-close"
                    label="Closing Time"
                    type="time"
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    id="btn-save-court"
                    type="submit"
                    variant="primary"
                    loading={submitting}
                  >
                    {editingCourt ? 'Save Changes' : 'Create Court'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

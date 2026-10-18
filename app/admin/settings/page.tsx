'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import Button from '@/components/ui/Button';
import adminStyles from '../admin.module.css';
import styles from './settings.module.css';

interface SettingsState {
  facility_name: string;
  facility_address: string;
  facility_contact_phone: string;
  facility_contact_email: string;
  cancellation_grace_hours: string;
  onsite_grace_period_mins: string;
  court_count: string;
  location_mode: string;
  default_opening_time: string;
  default_closing_time: string;
  gcash_account_name: string;
  gcash_account_number: string;
  maya_account_name: string;
  maya_account_number: string;
}

const INITIAL_SETTINGS: SettingsState = {
  facility_name: 'PicklePunto Arena & Club',
  facility_address: '128 Padel & Pickleball Way, Metro Manila, Philippines',
  facility_contact_phone: '+63 917 888 7868',
  facility_contact_email: 'hello@picklepunto.ph',
  cancellation_grace_hours: '12',
  onsite_grace_period_mins: '30',
  court_count: '4',
  location_mode: 'SINGLE',
  default_opening_time: '06:00',
  default_closing_time: '22:00',
  gcash_account_name: 'PicklePunto Sports Hub Inc.',
  gcash_account_number: '0917-888-7868',
  maya_account_name: 'PicklePunto Arena',
  maya_account_number: '0918-999-7868',
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(INITIAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch settings from API
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.data) {
        setSettings((prev) => ({
          ...prev,
          ...data.data,
        }));
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleChange = (key: keyof SettingsState, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSaveStatus(null);

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();

      if (res.ok) {
        setSaveStatus({ type: 'success', message: 'Facility settings saved and active.' });
        setTimeout(() => setSaveStatus(null), 4000);
      } else {
        setSaveStatus({ type: 'error', message: data.error || 'Failed to save settings' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating settings';
      setSaveStatus({ type: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={adminStyles.adminLayout}>
      <AdminHeader
        title="Facility Settings & Policies"
        subtitle="Configure operating hours, cancellation thresholds, arrival grace periods, and e-wallet credentials"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              onClick={fetchSettings}
              disabled={loading || saving}
            >
              🔄 Reload
            </Button>
          </div>
        }
      />

      <main className={adminStyles.mainContent}>
        <form onSubmit={handleSubmit} className={styles.container}>
          {/* Section 1: Facility Information */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>🏟️</span>
              <div className={styles.sectionTitle}>
                <h3>Facility Information</h3>
                <p>Public profile displayed on booking confirmations and player portal</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label htmlFor="facility_name">Facility Name</label>
                <input
                  id="facility_name"
                  type="text"
                  className={styles.formInput}
                  value={settings.facility_name}
                  onChange={(e) => handleChange('facility_name', e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="location_mode">
                  Location Mode
                  <span className={styles.fieldHelper}>Multi-court routing</span>
                </label>
                <select
                  id="location_mode"
                  className={styles.formSelect}
                  value={settings.location_mode}
                  onChange={(e) => handleChange('location_mode', e.target.value)}
                >
                  <option value="SINGLE">Single Facility (Standard)</option>
                  <option value="MULTI">Multi-Location Branch (Enterprise)</option>
                </select>
              </div>

              <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="facility_address">Physical Address</label>
                <input
                  id="facility_address"
                  type="text"
                  className={styles.formInput}
                  value={settings.facility_address}
                  onChange={(e) => handleChange('facility_address', e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="facility_contact_phone">Contact Phone</label>
                <input
                  id="facility_contact_phone"
                  type="text"
                  className={styles.formInput}
                  value={settings.facility_contact_phone}
                  onChange={(e) => handleChange('facility_contact_phone', e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="facility_contact_email">Contact Email</label>
                <input
                  id="facility_contact_email"
                  type="email"
                  className={styles.formInput}
                  value={settings.facility_contact_email}
                  onChange={(e) => handleChange('facility_contact_email', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Court Operations & Rules */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>⏱️</span>
              <div className={styles.sectionTitle}>
                <h3>Booking & Arrival Policies</h3>
                <p>Governs cancellation grace windows and on-site physical arrival voiding rules</p>
              </div>
            </div>

            <div className={styles.ruleCallout}>
              <span className={styles.ruleCalloutIcon}>ℹ️</span>
              <div>
                <strong>Strict Physical Arrival Rule:</strong> Reservations are protected upon booking.
                If players do not arrive physically on-site within the designated <strong>30-minute grace period</strong> from their scheduled reservation start time, the slot is automatically voided to NO_SHOW and becomes immediately available for counter walk-ins.
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label htmlFor="onsite_grace_period_mins">
                  Arrival Grace Period (Minutes)
                  <span className={styles.fieldHelper}>Default: 30 mins</span>
                </label>
                <input
                  id="onsite_grace_period_mins"
                  type="number"
                  min="5"
                  max="60"
                  className={styles.formInput}
                  value={settings.onsite_grace_period_mins}
                  onChange={(e) => handleChange('onsite_grace_period_mins', e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="cancellation_grace_hours">
                  Cancellation Grace Window (Hours)
                  <span className={styles.fieldHelper}>Default: 12 hrs</span>
                </label>
                <input
                  id="cancellation_grace_hours"
                  type="number"
                  min="1"
                  max="72"
                  className={styles.formInput}
                  value={settings.cancellation_grace_hours}
                  onChange={(e) => handleChange('cancellation_grace_hours', e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="default_opening_time">
                  Facility Opens (Daily)
                  <span className={styles.fieldHelper}>24-hr format</span>
                </label>
                <input
                  id="default_opening_time"
                  type="time"
                  className={styles.formInput}
                  value={settings.default_opening_time}
                  onChange={(e) => handleChange('default_opening_time', e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="default_closing_time">
                  Facility Closes (Daily)
                  <span className={styles.fieldHelper}>24-hr format</span>
                </label>
                <input
                  id="default_closing_time"
                  type="time"
                  className={styles.formInput}
                  value={settings.default_closing_time}
                  onChange={(e) => handleChange('default_closing_time', e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 3: E-Wallet Payment Credentials */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>💳</span>
              <div className={styles.sectionTitle}>
                <h3>E-Wallet Payment Configurations</h3>
                <p>Coordinates displayed to players during POS payment checkout and online reservations</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label htmlFor="gcash_account_name">GCash Account Name</label>
                <input
                  id="gcash_account_name"
                  type="text"
                  className={styles.formInput}
                  value={settings.gcash_account_name}
                  onChange={(e) => handleChange('gcash_account_name', e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="gcash_account_number">GCash Mobile Number</label>
                <input
                  id="gcash_account_number"
                  type="text"
                  className={styles.formInput}
                  value={settings.gcash_account_number}
                  onChange={(e) => handleChange('gcash_account_number', e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="maya_account_name">Maya Account Name</label>
                <input
                  id="maya_account_name"
                  type="text"
                  className={styles.formInput}
                  value={settings.maya_account_name}
                  onChange={(e) => handleChange('maya_account_name', e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="maya_account_number">Maya Mobile Number</label>
                <input
                  id="maya_account_number"
                  type="text"
                  className={styles.formInput}
                  value={settings.maya_account_number}
                  onChange={(e) => handleChange('maya_account_number', e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className={styles.bottomBar}>
            <div>
              {saveStatus && (
                <div
                  className={`${styles.statusMessage} ${
                    saveStatus.type === 'success' ? styles.statusSuccess : styles.statusError
                  }`}
                >
                  {saveStatus.type === 'success' ? '✅' : '⚠️'} {saveStatus.message}
                </div>
              )}
            </div>

            <div className={styles.actionsRight}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSettings(INITIAL_SETTINGS)}
                disabled={saving}
              >
                Reset to Defaults
              </Button>
              <Button
                type="submit"
                variant="primary"
                id="btn-save-settings"
                disabled={saving}
              >
                {saving ? 'Saving Settings...' : '💾 Save Settings'}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

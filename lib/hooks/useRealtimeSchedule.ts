'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function useRealtimeSchedule(onUpdate: () => void) {
  const [isConnected, setIsConnected] = useState(false);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    // Channel for real-time schedule updates across courts
    const channel = supabase
      .channel('schedule-live-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          onUpdate();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'court_blocks' },
        () => {
          onUpdate();
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, onUpdate]);

  return { isConnected };
}

import AdminSidebar from '@/components/layout/AdminSidebar';
import styles from './admin.module.css';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.adminContainer}>
      <AdminSidebar />
      <div className={styles.adminMain}>
        {children}
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import adminStyles from '../admin.module.css';
import styles from './inventory.module.css';

interface ProductItem {
  id: string;
  name: string;
  category: 'RENTAL' | 'RETAIL' | 'FOOD_DRINK';
  price: string;
  stockQty: number;
  lowStockThreshold: number;
  sku: string | null;
  createdAt: string;
}

export default function AdminInventoryPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [alertTriggering, setAlertTriggering] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Quick Stock Adjustment Modal State
  const [adjustingProduct, setAdjustingProduct] = useState<ProductItem | null>(null);
  const [adjustMode, setAdjustMode] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustValue, setAdjustValue] = useState<string>('5');
  const [adjustReason, setAdjustReason] = useState<string>('Restock Shipment');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Add / Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '',
    category: 'RETAIL' as 'RENTAL' | 'RETAIL' | 'FOOD_DRINK',
    price: '',
    stockQty: '10',
    lowStockThreshold: '5',
    sku: '',
  });
  const [submittingProduct, setSubmittingProduct] = useState(false);

  // Fetch Products
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.data) {
        setProducts(data.data);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Flash action feedback
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setActionFeedback({ type, message });
    setTimeout(() => {
      setActionFeedback(null);
    }, 4500);
  };

  // Trigger automated low-stock alert cron
  const handleTriggerLowStockAlert = async () => {
    try {
      setAlertTriggering(true);
      const res = await fetch('/api/cron/low-stock-check', { method: 'POST' });
      const data = await res.json();
      if (data.data) {
        showFeedback(
          'success',
          `Low-Stock Check Complete: ${data.data.lowStockCount} items flagged, ${data.data.alertsQueued} email alerts queued for staff.`
        );
      } else {
        showFeedback('error', data.error || 'Failed to trigger low stock alert');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error executing alert job';
      showFeedback('error', msg);
    } finally {
      setAlertTriggering(false);
    }
  };

  // KPIs
  const totalProducts = products.length;
  const totalUnits = useMemo(() => products.reduce((acc, p) => acc + p.stockQty, 0), [products]);
  const lowStockCount = useMemo(
    () => products.filter((p) => p.stockQty <= p.lowStockThreshold).length,
    [products]
  );
  const inventoryValuation = useMemo(
    () =>
      products.reduce((acc, p) => acc + parseFloat(p.price || '0') * p.stockQty, 0),
    [products]
  );

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory =
        selectedCategory === 'ALL' || p.category === selectedCategory;
      const matchesLowStock = !onlyLowStock || p.stockQty <= p.lowStockThreshold;

      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [products, searchTerm, selectedCategory, onlyLowStock]);

  // Stock Adjustment Submission
  const handleStockAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;

    const val = parseInt(adjustValue, 10);
    if (isNaN(val) || val <= 0) {
      showFeedback('error', 'Please enter a valid positive number');
      return;
    }

    let payload: Record<string, unknown> = { reason: adjustReason };
    if (adjustMode === 'add') {
      payload.delta = val;
    } else if (adjustMode === 'subtract') {
      payload.delta = -val;
    } else {
      payload.newQty = val;
    }

    try {
      setSubmittingAdjust(true);
      const res = await fetch(`/api/products/${adjustingProduct.id}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        showFeedback('error', data.error || 'Failed to adjust stock');
        return;
      }

      showFeedback(
        'success',
        `Stock updated for ${adjustingProduct.name}: ${data.data.previousStock} → ${data.data.newStock}`
      );
      setAdjustingProduct(null);
      fetchProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating stock';
      showFeedback('error', msg);
    } finally {
      setSubmittingAdjust(false);
    }
  };

  // Add or Edit Product Submission
  const handleProductFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name.trim() || !productForm.price) {
      showFeedback('error', 'Product name and price are required.');
      return;
    }

    try {
      setSubmittingProduct(true);
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: productForm.name.trim(),
          category: productForm.category,
          price: parseFloat(productForm.price),
          stockQty: parseInt(productForm.stockQty, 10) || 0,
          lowStockThreshold: parseInt(productForm.lowStockThreshold, 10) || 5,
          sku: productForm.sku.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showFeedback('error', data.error || 'Failed to save product');
        return;
      }

      showFeedback(
        'success',
        editingProduct ? `Updated ${productForm.name}` : `Created ${productForm.name}`
      );
      setIsAddModalOpen(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving product';
      showFeedback('error', msg);
    } finally {
      setSubmittingProduct(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (p: ProductItem) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name,
      category: p.category,
      price: p.price,
      stockQty: p.stockQty.toString(),
      lowStockThreshold: p.lowStockThreshold.toString(),
      sku: p.sku || '',
    });
    setIsAddModalOpen(true);
  };

  // Delete Product
  const handleDeleteProduct = async (p: ProductItem) => {
    if (!window.confirm(`Are you sure you want to delete '${p.name}'?`)) return;

    try {
      const res = await fetch(`/api/products/${p.id}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        showFeedback('error', data.error || 'Failed to delete product');
        return;
      }

      showFeedback('success', `Deleted product '${p.name}'`);
      fetchProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting product';
      showFeedback('error', msg);
    }
  };

  // Preview stock change in modal
  const previewNewStock = useMemo(() => {
    if (!adjustingProduct) return 0;
    const val = parseInt(adjustValue, 10);
    if (isNaN(val)) return adjustingProduct.stockQty;

    if (adjustMode === 'add') return adjustingProduct.stockQty + val;
    if (adjustMode === 'subtract') return Math.max(0, adjustingProduct.stockQty - val);
    return Math.max(0, val);
  }, [adjustingProduct, adjustMode, adjustValue]);

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'RENTAL':
        return <Badge label="🏓 Rental Gear" status="default" />;
      case 'RETAIL':
        return <Badge label="🛍️ Pro Shop" status="confirmed" />;
      case 'FOOD_DRINK':
        return <Badge label="🥤 Refreshment" status="paid" />;
      default:
        return <Badge label={category} status="default" />;
    }
  };

  return (
    <div className={adminStyles.adminLayout}>
      <AdminHeader
        title="Inventory & Pro Shop"
        subtitle="Manage equipment rentals, merchandise catalog, stock adjustments, and low-inventory alerts"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              id="btn-alert-job"
              onClick={handleTriggerLowStockAlert}
              disabled={alertTriggering}
            >
              {alertTriggering ? 'Running Audit...' : '🔔 Audit Low Stock'}
            </Button>
            <Button
              variant="primary"
              id="btn-add-product"
              onClick={() => {
                setEditingProduct(null);
                setProductForm({
                  name: '',
                  category: 'RETAIL',
                  price: '',
                  stockQty: '10',
                  lowStockThreshold: '5',
                  sku: '',
                });
                setIsAddModalOpen(true);
              }}
            >
              + Add New Product
            </Button>
          </div>
        }
      />
      <main className={adminStyles.mainContent}>
        <div className={styles.container}>

          {/* Feedback Banner */}
          {actionFeedback && (
            <div
              className={styles.alertBanner}
              style={{
                borderColor: actionFeedback.type === 'success' ? '#22c55e' : '#ef4444',
                background:
                  actionFeedback.type === 'success'
                    ? 'rgba(34, 197, 94, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
              }}
            >
              <div className={styles.alertContent}>
                <span className={styles.alertIcon}>
                  {actionFeedback.type === 'success' ? '✅' : '⚠️'}
                </span>
                <div className={styles.alertText}>
                  <h4>{actionFeedback.type === 'success' ? 'Operation Succeeded' : 'Notice'}</h4>
                  <p>{actionFeedback.message}</p>
                </div>
              </div>
            </div>
          )}

          {/* KPI Stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(56, 189, 248, 0.15)', color: 'var(--ink-blue)' }}>
                📦
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Total SKUs</span>
                <span className={styles.statValue}>{totalProducts}</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(34, 197, 94, 0.15)', color: 'var(--ink-green)' }}>
                🔢
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Total In Stock</span>
                <span className={styles.statValue}>{totalUnits.toLocaleString()} units</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div
                className={styles.statIcon}
                style={{
                  background: lowStockCount > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(100, 116, 139, 0.15)',
                  color: lowStockCount > 0 ? 'var(--ink-red)' : 'var(--color-text-secondary)',
                }}
              >
                ⚠️
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Low Stock Alerts</span>
                <span className={`${styles.statValue} ${lowStockCount > 0 ? styles.statValueDanger : ''}`}>
                  {lowStockCount} items
                </span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--ink-amber)' }}>
                💰
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Inventory Value</span>
                <span className={styles.statValue}>₱{inventoryValuation.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Low Stock Warning Banner */}
          {lowStockCount > 0 && (
            <div className={styles.alertBanner} id="low-stock-banner">
              <div className={styles.alertContent}>
                <span className={styles.alertIcon}>⚠️</span>
                <div className={styles.alertText}>
                  <h4>Attention: {lowStockCount} product(s) are at or below reorder threshold</h4>
                  <p>
                    Stock levels have dipped. Click &quot;Audit Low Stock&quot; to notify management, or click &quot;Adjust&quot; on any item to log restock arrivals.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOnlyLowStock(!onlyLowStock)}
              >
                {onlyLowStock ? 'Show All Products' : 'View Low Stock Only'}
              </Button>
            </div>
          )}

          {/* Filter and Search Bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchBox}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search products by name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                id="inventory-search-input"
              />
            </div>

            <div className={styles.filterPills}>
              <button
                type="button"
                className={`${styles.pillBtn} ${selectedCategory === 'ALL' && !onlyLowStock ? styles.pillBtnActive : ''}`}
                onClick={() => {
                  setSelectedCategory('ALL');
                  setOnlyLowStock(false);
                }}
              >
                All Items ({totalProducts})
              </button>
              <button
                type="button"
                className={`${styles.pillBtn} ${selectedCategory === 'RENTAL' && !onlyLowStock ? styles.pillBtnActive : ''}`}
                onClick={() => {
                  setSelectedCategory('RENTAL');
                  setOnlyLowStock(false);
                }}
              >
                🏓 Rentals
              </button>
              <button
                type="button"
                className={`${styles.pillBtn} ${selectedCategory === 'RETAIL' && !onlyLowStock ? styles.pillBtnActive : ''}`}
                onClick={() => {
                  setSelectedCategory('RETAIL');
                  setOnlyLowStock(false);
                }}
              >
                🛍️ Pro Shop
              </button>
              <button
                type="button"
                className={`${styles.pillBtn} ${selectedCategory === 'FOOD_DRINK' && !onlyLowStock ? styles.pillBtnActive : ''}`}
                onClick={() => {
                  setSelectedCategory('FOOD_DRINK');
                  setOnlyLowStock(false);
                }}
              >
                🥤 Food & Drinks
              </button>
              <button
                type="button"
                className={`${styles.pillBtn} ${styles.pillBtnDanger} ${onlyLowStock ? styles.pillBtnDangerActive : ''}`}
                onClick={() => setOnlyLowStock(!onlyLowStock)}
              >
                ⚠️ Low Stock ({lowStockCount})
              </button>
            </div>
          </div>

          {/* Products Table */}
          <div className={styles.tableContainer}>
            <table className={styles.table} id="products-table">
              <thead>
                <tr>
                  <th>Product & Category</th>
                  <th>SKU</th>
                  <th>Unit Price</th>
                  <th>Stock Level</th>
                  <th>Min Threshold</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      Loading inventory catalog...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      <span style={{ fontSize: '2rem' }}>📦</span>
                      <p>No products match your current filters or search term.</p>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const isLow = p.stockQty <= p.lowStockThreshold && p.stockQty > 0;
                    const isOut = p.stockQty === 0;
                    const stockPercent = Math.min(100, Math.round((p.stockQty / (p.lowStockThreshold * 3)) * 100));

                    return (
                      <tr key={p.id} id={`product-row-${p.id}`}>
                        <td>
                          <div className={styles.productCell}>
                            <span className={styles.productName}>{p.name}</span>
                            <span className={styles.productCategory}>
                              {getCategoryBadge(p.category)}
                            </span>
                          </div>
                        </td>
                        <td>
                          {p.sku ? (
                            <span className={styles.skuCode}>{p.sku}</span>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>—</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          ₱{parseFloat(p.price).toFixed(2)}
                        </td>
                        <td>
                          <div className={styles.stockWrapper}>
                            <div className={styles.stockNumbers}>
                              <span
                                className={`${styles.stockQtyCurrent} ${
                                  isOut
                                    ? styles.statValueDanger
                                    : isLow
                                    ? 'text-amber-400'
                                    : styles.statValueSuccess
                                }`}
                              >
                                {p.stockQty} in stock
                              </span>
                              {isOut ? (
                                <Badge label="Out of Stock" status="cancelled" />
                              ) : isLow ? (
                                <Badge label="Low" status="warning" />
                              ) : (
                                <Badge label="OK" status="confirmed" />
                              )}
                            </div>
                            <div className={styles.stockBarBg}>
                              <div
                                className={`${styles.stockBarFill} ${
                                  isOut
                                    ? styles.stockBarOut
                                    : isLow
                                    ? styles.stockBarLow
                                    : styles.stockBarNormal
                                }`}
                                style={{ width: `${Math.max(5, stockPercent)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                          {p.lowStockThreshold} units
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className={styles.actionBtns} style={{ justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className={styles.quickAdjustBtn}
                              onClick={() => {
                                setAdjustingProduct(p);
                                setAdjustMode('add');
                                setAdjustValue('5');
                                setAdjustReason('Restock Shipment');
                              }}
                              title="Adjust Stock Level"
                            >
                              ⚡ Adjust
                            </button>
                            <button
                              type="button"
                              className={styles.iconBtn}
                              onClick={() => openEditModal(p)}
                              title="Edit Product"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                              onClick={() => handleDeleteProduct(p)}
                              title="Delete Product"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Stock Adjustment Modal */}
        {adjustingProduct && (
          <div className={styles.modalOverlay} onClick={() => setAdjustingProduct(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3>Adjust Stock: {adjustingProduct.name}</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setAdjustingProduct(null)}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleStockAdjustmentSubmit}>
                <div className={styles.modalBody}>
                  <div className={styles.stockAdjustmentCurrent}>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'block' }}>
                        Current On-Hand Stock
                      </span>
                      <strong style={{ fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
                        {adjustingProduct.stockQty} units
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'block' }}>
                        Min Threshold
                      </span>
                      <span style={{ color: 'var(--color-text-primary)' }}>{adjustingProduct.lowStockThreshold} units</span>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Adjustment Mode</label>
                    <div className={styles.adjustModeTabs}>
                      <button
                        type="button"
                        className={`${styles.adjustModeBtn} ${
                          adjustMode === 'add' ? styles.adjustModeBtnActive : ''
                        }`}
                        onClick={() => {
                          setAdjustMode('add');
                          setAdjustReason('Restock Shipment');
                        }}
                      >
                        ➕ Restock (+)
                      </button>
                      <button
                        type="button"
                        className={`${styles.adjustModeBtn} ${
                          adjustMode === 'subtract' ? styles.adjustModeBtnActive : ''
                        }`}
                        onClick={() => {
                          setAdjustMode('subtract');
                          setAdjustReason('Damaged / Spoilage');
                        }}
                      >
                        ➖ Deduct (-)
                      </button>
                      <button
                        type="button"
                        className={`${styles.adjustModeBtn} ${
                          adjustMode === 'set' ? styles.adjustModeBtnActive : ''
                        }`}
                        onClick={() => {
                          setAdjustMode('set');
                          setAdjustReason('Routine Physical Audit');
                        }}
                      >
                        🎯 Set Count (=)
                      </button>
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label>
                      {adjustMode === 'add'
                        ? 'Units to Add'
                        : adjustMode === 'subtract'
                        ? 'Units to Deduct'
                        : 'New Total Quantity'}
                    </label>
                    <input
                      type="number"
                      min="1"
                      className={styles.formInput}
                      value={adjustValue}
                      onChange={(e) => setAdjustValue(e.target.value)}
                      required
                    />
                  </div>

                  <div className={styles.previewResult}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Resulting Stock:</span>
                    <strong
                      style={{
                        fontSize: '1.1rem',
                        color:
                          previewNewStock <= adjustingProduct.lowStockThreshold
                            ? '#f87171'
                            : '#4ade80',
                      }}
                    >
                      {previewNewStock} units
                      {previewNewStock <= adjustingProduct.lowStockThreshold && ' (Low Stock ⚠️)'}
                    </strong>
                  </div>

                  <div className={styles.formGroup}>
                    <label>Audit Reason (Required)</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Supplier delivery PO-9812, Damaged racket, Inventory count"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      required
                    />
                    <div className={styles.reasonSuggestions}>
                      <span
                        className={styles.reasonTag}
                        onClick={() => setAdjustReason('Restock Shipment')}
                      >
                        + Restock Shipment
                      </span>
                      <span
                        className={styles.reasonTag}
                        onClick={() => setAdjustReason('Damaged / Broken Gear')}
                      >
                        - Damaged Gear
                      </span>
                      <span
                        className={styles.reasonTag}
                        onClick={() => setAdjustReason('Customer Return / Restock')}
                      >
                        + Customer Return
                      </span>
                      <span
                        className={styles.reasonTag}
                        onClick={() => setAdjustReason('Routine Physical Audit')}
                      >
                        = Physical Audit
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAdjustingProduct(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submittingAdjust}
                  >
                    {submittingAdjust ? 'Updating...' : 'Confirm Adjustment'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add / Edit Product Modal */}
        {isAddModalOpen && (
          <div className={styles.modalOverlay} onClick={() => setIsAddModalOpen(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3>{editingProduct ? `Edit Product: ${editingProduct.name}` : 'Add New Product'}</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setIsAddModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleProductFormSubmit}>
                <div className={styles.modalBody}>
                  <div className={styles.formGroup}>
                    <label>Product Name *</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. Franklin X-40 Pickleball (3-pack)"
                      value={productForm.name}
                      onChange={(e) =>
                        setProductForm({ ...productForm, name: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Category *</label>
                      <select
                        className={styles.formSelect}
                        value={productForm.category}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            category: e.target.value as any,
                          })
                        }
                      >
                        <option value="RETAIL">🛍️ Retail / Pro Shop</option>
                        <option value="RENTAL">🏓 Court Rental Gear</option>
                        <option value="FOOD_DRINK">🥤 Food & Drink</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label>Price (PHP ₱) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={styles.formInput}
                        placeholder="0.00"
                        value={productForm.price}
                        onChange={(e) =>
                          setProductForm({ ...productForm, price: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label>Current Stock (Units)</label>
                      <input
                        type="number"
                        min="0"
                        className={styles.formInput}
                        value={productForm.stockQty}
                        onChange={(e) =>
                          setProductForm({ ...productForm, stockQty: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Low-Stock Threshold</label>
                      <input
                        type="number"
                        min="0"
                        className={styles.formInput}
                        value={productForm.lowStockThreshold}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            lowStockThreshold: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label>SKU / Barcode (Optional)</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. BALL-FX40-3PK"
                      value={productForm.sku}
                      onChange={(e) =>
                        setProductForm({ ...productForm, sku: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submittingProduct}
                  >
                    {submittingProduct
                      ? 'Saving...'
                      : editingProduct
                      ? 'Save Changes'
                      : 'Create Product'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

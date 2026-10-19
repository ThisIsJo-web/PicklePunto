'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import adminStyles from '../admin.module.css';
import styles from './pos.module.css';

interface Product {
  id: string;
  name: string;
  category: 'RENTAL' | 'RETAIL' | 'FOOD_DRINK';
  price: string;
  stockQty: number;
  lowStockThreshold: number;
  sku: string | null;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface User {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
}

interface Court {
  id: string;
  name: string;
}

interface PosTab {
  id: string;
  courtId: string | null;
  courtName: string | null;
  playerId: string | null;
  playerName: string;
  playerEmail: string | null;
  playerPhone: string | null;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  itemsCount: number;
  totalAmount: string;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    category: string;
    sku: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
}

interface ReceiptData {
  receiptNumber: string;
  transactionId: string;
  tabId: string;
  date: string;
  courtName: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  items: Array<{
    id: string;
    name: string;
    category: string;
    sku: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  totalAmount: string;
  paymentMethod: string;
  cashTendered: string | null;
  changeDue: string | null;
  paymentReference: string | null;
}

export default function PosPage() {
  // Catalog State
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerMode, setCustomerMode] = useState<'WALKIN' | 'REGISTERED' | 'COURT'>('WALKIN');
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [selectedCourtId, setSelectedCourtId] = useState('');
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // References
  const [users, setUsers] = useState<User[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [openTabs, setOpenTabs] = useState<PosTab[]>([]);
  const [isOpenTabsDrawerOpen, setIsOpenTabsDrawerOpen] = useState(false);

  // Numpad & Quick Input State
  const [showNumpad, setShowNumpad] = useState(false);
  const [selectedCartIndex, setSelectedCartIndex] = useState<number | null>(null);

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'EWALLET'>('CASH');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [ewalletReference, setEwalletReference] = useState('');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);
  const [emailingReceipt, setEmailingReceipt] = useState(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const [prodRes, usersRes, courtsRes, tabsRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/users'),
        fetch('/api/courts'),
        fetch('/api/pos/tabs?status=OPEN'),
      ]);

      const [prodJson, usersJson, courtsJson, tabsJson] = await Promise.all([
        prodRes.json(),
        usersRes.json(),
        courtsRes.json(),
        tabsRes.json(),
      ]);

      if (prodJson.data) setProducts(prodJson.data);
      if (usersJson.data) {
        setUsers(usersJson.data);
        if (usersJson.data.length > 0 && !selectedPlayerId) {
          setSelectedPlayerId(usersJson.data[0].id);
        }
      }
      if (courtsJson.data) {
        setCourts(courtsJson.data);
        if (courtsJson.data.length > 0 && !selectedCourtId) {
          setSelectedCourtId(courtsJson.data[0].id);
        }
      }
      if (tabsJson.data) setOpenTabs(tabsJson.data);
    } catch (err) {
      console.error('Failed to load POS data:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, [selectedPlayerId, selectedCourtId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat =
        selectedCategory === 'ALL' || p.category === selectedCategory;
      const matchesQuery =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCat && matchesQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart Calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      return acc + parseFloat(item.product.price) * item.quantity;
    }, 0);
  }, [cart]);

  const totalItemsCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0);
  }, [cart]);

  // Add Product to Cart
  function handleAddToCart(product: Product) {
    if (product.stockQty <= 0) return;

    setCart((prev) => {
      const idx = prev.findIndex((item) => item.product.id === product.id);
      if (idx >= 0) {
        const currentQty = prev[idx].quantity;
        if (currentQty >= product.stockQty) {
          alert(`Cannot add more "${product.name}". Max available stock reached (${product.stockQty}).`);
          return prev;
        }
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: currentQty + 1 };
        return updated;
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  // Update Item Quantity
  function handleUpdateQuantity(index: number, delta: number) {
    setCart((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      if (newQty > updated[index].product.stockQty) {
        alert(`Cannot set quantity above available stock (${updated[index].product.stockQty}).`);
        return prev;
      }
      updated[index] = { ...updated[index], quantity: newQty };
      return updated;
    });
  }

  // Remove Item
  function handleRemoveItem(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
    if (selectedCartIndex === index) {
      setSelectedCartIndex(null);
    }
  }

  // Clear Cart
  function handleClearCart() {
    if (cart.length === 0) return;
    if (confirm('Are you sure you want to clear the active cart?')) {
      setCart([]);
      setActiveTabId(null);
      setSelectedCartIndex(null);
    }
  }

  // Numpad key press
  function handleNumpadPress(key: string) {
    if (selectedCartIndex === null || !cart[selectedCartIndex]) return;

    const currentItem = cart[selectedCartIndex];
    if (key === 'C') {
      handleRemoveItem(selectedCartIndex);
      return;
    }

    if (key === '⌫') {
      const str = String(currentItem.quantity);
      const nextStr = str.slice(0, -1);
      const nextVal = parseInt(nextStr, 10) || 0;
      if (nextVal <= 0) {
        handleRemoveItem(selectedCartIndex);
      } else {
        setCart((prev) => {
          const updated = [...prev];
          updated[selectedCartIndex] = { ...updated[selectedCartIndex], quantity: nextVal };
          return updated;
        });
      }
      return;
    }

    // Digit entered
    const currentStr = currentItem.quantity === 1 ? '' : String(currentItem.quantity);
    const nextVal = parseInt(currentStr + key, 10);
    if (!isNaN(nextVal) && nextVal > 0) {
      if (nextVal > currentItem.product.stockQty) {
        alert(`Max available stock is ${currentItem.product.stockQty}.`);
        return;
      }
      setCart((prev) => {
        const updated = [...prev];
        updated[selectedCartIndex] = { ...updated[selectedCartIndex], quantity: nextVal };
        return updated;
      });
    }
  }

  // Open Checkout Modal
  function handleOpenCheckout() {
    if (cart.length === 0) {
      alert('Cart is empty. Please add products first.');
      return;
    }
    setCashTendered(Math.ceil(cartSubtotal).toFixed(2));
    setEwalletReference('');
    setPaymentError(null);
    setIsPaymentModalOpen(true);
  }

  // Process Checkout
  async function handleCompleteCheckout(e: React.FormEvent) {
    e.preventDefault();
    setIsProcessingPayment(true);
    setPaymentError(null);

    try {
      if (paymentMethod === 'CASH') {
        const tendered = parseFloat(cashTendered);
        if (isNaN(tendered) || tendered < cartSubtotal) {
          throw new Error(
            `Cash tendered ($₱${tendered || 0}) must be at least the total amount ($${cartSubtotal.toFixed(2)}).`
          );
        }
      } else if (paymentMethod === 'EWALLET') {
        if (!ewalletReference.trim()) {
          throw new Error('Please enter the E-Wallet reference or transaction number.');
        }
      }

      let res;
      if (activeTabId) {
        // Checking out an existing open tab
        res = await fetch(`/api/pos/tabs/${activeTabId}/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod,
            paymentReference: ewalletReference.trim() || undefined,
            cashTendered: paymentMethod === 'CASH' ? cashTendered : undefined,
            receiptEmail: receiptEmail.trim() || undefined,
          }),
        });
      } else {
        // Direct counter checkout
        const payload = {
          items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
          courtId: customerMode === 'COURT' ? selectedCourtId : undefined,
          playerId: customerMode === 'REGISTERED' ? selectedPlayerId : undefined,
          customerName:
            customerMode === 'WALKIN'
              ? walkInName.trim() || 'Counter Walk-in'
              : undefined,
          customerPhone:
            customerMode === 'WALKIN' ? walkInPhone.trim() || undefined : undefined,
          customerEmail: receiptEmail.trim() || undefined,
          paymentMethod,
          paymentReference: ewalletReference.trim() || undefined,
          cashTendered: paymentMethod === 'CASH' ? cashTendered : undefined,
        };

        res = await fetch('/api/pos/checkout-direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to process payment');
      }

      // Successful checkout!
      setIsPaymentModalOpen(false);
      setCart([]);
      setActiveTabId(null);
      setWalkInName('');
      setWalkInPhone('');
      setActiveReceipt(json.data.receipt);
      loadData(); // refresh open tabs & product stock counts
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : 'Error completing payment');
    } finally {
      setIsProcessingPayment(false);
    }
  }

  // Save to / Attach to Court Open Tab
  async function handleSaveOpenTab() {
    if (cart.length === 0) {
      alert('Cart is empty. Please add items to attach to tab.');
      return;
    }

    try {
      const payload = {
        courtId: customerMode === 'COURT' ? selectedCourtId : undefined,
        playerId: customerMode === 'REGISTERED' ? selectedPlayerId : undefined,
        items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      };

      const res = await fetch('/api/pos/tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to open court tab');
      }

      alert('✅ Tab opened and items attached successfully!');
      setCart([]);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error saving tab');
    }
  }

  // Load an existing open tab into the active cart for checkout or additions
  function handleLoadTabToCart(tab: PosTab) {
    setActiveTabId(tab.id);
    if (tab.courtId) {
      setCustomerMode('COURT');
      setSelectedCourtId(tab.courtId);
    } else if (tab.playerId) {
      setCustomerMode('REGISTERED');
      setSelectedPlayerId(tab.playerId);
    } else {
      setCustomerMode('WALKIN');
      setWalkInName(tab.playerName);
    }

    // Convert tab items to cart
    const loadedCart: CartItem[] = tab.items
      .map((item) => {
        const prod = products.find((p) => p.id === item.productId);
        if (!prod) return null;
        return {
          product: prod,
          quantity: item.quantity,
        };
      })
      .filter((i): i is CartItem => i !== null);

    setCart(loadedCart);
    setIsOpenTabsDrawerOpen(false);
  }

  // Void an existing open tab
  async function handleVoidTab(tabId: string) {
    if (!confirm('Are you sure you want to void this tab? Items will be returned to inventory stock.')) {
      return;
    }

    try {
      const res = await fetch(`/api/pos/tabs/${tabId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to void tab');
      }
      if (activeTabId === tabId) {
        setActiveTabId(null);
        setCart([]);
      }
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error voiding tab');
    }
  }

  // Print Receipt
  function handlePrintReceipt() {
    window.print();
  }

  // Send Email Receipt
  async function handleSendEmailReceipt() {
    if (!activeReceipt || !receiptEmail.trim()) {
      alert('Please enter a valid recipient email.');
      return;
    }

    try {
      setEmailingReceipt(true);
      setEmailSuccessMsg(null);
      const res = await fetch('/api/pos/receipts/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: receiptEmail.trim(),
          receipt: activeReceipt,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to queue receipt email');
      }

      setEmailSuccessMsg(`✓ Digital receipt queued for ${receiptEmail.trim()}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error emailing receipt');
    } finally {
      setEmailingReceipt(false);
    }
  }

  const changeDueDisplay = useMemo(() => {
    if (paymentMethod !== 'CASH') return 0;
    const tendered = parseFloat(cashTendered) || 0;
    return Math.max(0, tendered - cartSubtotal);
  }, [paymentMethod, cashTendered, cartSubtotal]);

  return (
    <>
      <AdminHeader
        title="POS & Counter Sales"
        subtitle="Tablet-friendly counter sales, pro shop inventory, and in-session court tabs"
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              id="btn-open-tabs-modal"
              variant={openTabs.length > 0 ? 'primary' : 'secondary'}
              onClick={() => setIsOpenTabsDrawerOpen(true)}
            >
              📂 Active Tabs ({openTabs.length})
            </Button>
            <Button id="btn-refresh-pos" variant="ghost" onClick={loadData}>
              🔄 Refresh
            </Button>
          </div>
        }
      />

      <main className={adminStyles.pageContent}>
        <div className={styles.posContainer}>
          {/* ── Left Pane: Product Catalog Grid ── */}
          <div className={styles.catalogPane}>
            <div className={styles.catalogControls}>
              {/* Search Bar */}
              <div className={styles.searchBarWrapper}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  id="pos-search-input"
                  type="text"
                  placeholder="Search products by name or SKU..."
                  className={styles.searchInput}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Category Pills */}
              <div className={styles.categoryPills}>
                {[
                  { id: 'ALL', label: 'All Items' },
                  { id: 'FOOD_DRINK', label: '🥤 Food & Drinks' },
                  { id: 'RETAIL', label: '🎾 Gear & Retail' },
                  { id: 'RENTAL', label: '🏸 Equipment Rentals' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    id={`pos-category-${cat.id.toLowerCase()}`}
                    type="button"
                    className={`${styles.categoryPill} ${
                      selectedCategory === cat.id ? styles.categoryPillActive : ''
                    }`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Products Grid Cards */}
            {loadingProducts ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Loading product catalog...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No products found matching your search.
              </div>
            ) : (
              <div className={styles.productGrid}>
                {filteredProducts.map((p) => {
                  const isOutOfStock = p.stockQty <= 0;
                  const isLowStock = p.stockQty > 0 && p.stockQty <= p.lowStockThreshold;

                  let catClass = styles.categoryRetail;
                  if (p.category === 'RENTAL') catClass = styles.categoryRental;
                  if (p.category === 'FOOD_DRINK') catClass = styles.categoryFoodDrink;

                  return (
                    <div
                      key={p.id}
                      id={`product-card-${p.sku || p.id}`}
                      className={`${styles.productCard} ${isOutOfStock ? styles.productCardOutOfStock : ''}`}
                      onClick={() => !isOutOfStock && handleAddToCart(p)}
                    >
                      <div className={styles.productTopRow}>
                        <span className={`${styles.categoryTag} ${catClass}`}>
                          {p.category.replace('_', ' ')}
                        </span>
                        {p.sku && <span className={styles.skuTag}>{p.sku}</span>}
                      </div>

                      <div className={styles.productName}>{p.name}</div>

                      <div className={styles.productBottomRow}>
                        <div className={styles.priceTag}>₱${parseFloat(p.price).toFixed(2)}</div>
                        <div className={styles.stockBadge}>
                          {isOutOfStock ? (
                            <span className={styles.stockOut}>Out of Stock</span>
                          ) : isLowStock ? (
                            <span className={styles.stockLowStock}>Only {p.stockQty} left</span>
                          ) : (
                            <span className={styles.stockInStock}>{p.stockQty} in stock</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right Pane: Active Cart & Tab Checkout ── */}
          <div className={styles.cartPane}>
            <div className={styles.cartHeader}>
              <div className={styles.cartTitle}>
                <span>🛒 Current Order</span>
                {activeTabId && (
                  <Badge label="Active Court Tab" status="confirmed" />
                )}
              </div>
              <button
                type="button"
                id="btn-clear-cart"
                className={styles.cartClearBtn}
                onClick={handleClearCart}
              >
                Clear Cart
              </button>
            </div>

            {/* Customer & Tab Assignment */}
            <div className={styles.customerAssignment}>
              <div className={styles.assignmentTabs}>
                <button
                  type="button"
                  id="tab-mode-walkin"
                  className={`${styles.assignmentTabBtn} ${
                    customerMode === 'WALKIN' ? styles.assignmentTabBtnActive : ''
                  }`}
                  onClick={() => setCustomerMode('WALKIN')}
                >
                  ⚡ Walk-in
                </button>
                <button
                  type="button"
                  id="tab-mode-player"
                  className={`${styles.assignmentTabBtn} ${
                    customerMode === 'REGISTERED' ? styles.assignmentTabBtnActive : ''
                  }`}
                  onClick={() => setCustomerMode('REGISTERED')}
                >
                  👤 Player
                </button>
                <button
                  type="button"
                  id="tab-mode-court"
                  className={`${styles.assignmentTabBtn} ${
                    customerMode === 'COURT' ? styles.assignmentTabBtnActive : ''
                  }`}
                  onClick={() => setCustomerMode('COURT')}
                >
                  🎾 Court Tab
                </button>
              </div>

              {customerMode === 'WALKIN' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 'var(--space-2)' }}>
                  <input
                    id="input-pos-walkin-name"
                    type="text"
                    placeholder="Guest Name (Optional)"
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border)',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                  <input
                    id="input-pos-walkin-phone"
                    type="tel"
                    placeholder="Phone (Optional)"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    style={{
                      background: 'var(--color-bg-surface)',
                      border: '1px solid var(--color-border)',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
              )}

              {customerMode === 'REGISTERED' && (
                <select
                  id="select-pos-player"
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border)',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                  }}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </select>
              )}

              {customerMode === 'COURT' && (
                <select
                  id="select-pos-court"
                  value={selectedCourtId}
                  onChange={(e) => setSelectedCourtId(e.target.value)}
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px solid var(--color-border)',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                  }}
                >
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className={styles.cartEmpty}>
                <span className={styles.cartEmptyIcon}>🎾</span>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
                  Cart is empty. Tap products on the left to add items.
                </p>
              </div>
            ) : (
              <div className={styles.cartItemsList}>
                {cart.map((item, idx) => {
                  const lineTotal = (
                    parseFloat(item.product.price) * item.quantity
                  ).toFixed(2);
                  const isSelected = selectedCartIndex === idx;

                  return (
                    <div
                      key={item.product.id}
                      className={styles.cartItemRow}
                      style={
                        isSelected
                          ? { border: '1px solid var(--color-brand-500)', background: 'var(--color-bg-hover)' }
                          : undefined
                      }
                      onClick={() => setSelectedCartIndex(idx)}
                    >
                      <div className={styles.cartItemInfo}>
                        <div className={styles.cartItemName}>{item.product.name}</div>
                        <div className={styles.cartItemMeta}>
                          ₱${parseFloat(item.product.price).toFixed(2)} each
                        </div>
                      </div>

                      <div className={styles.qtyControlGroup} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={styles.qtyBtn}
                          onClick={() => handleUpdateQuantity(idx, -1)}
                          aria-label="Decrease quantity"
                        >
                          –
                        </button>
                        <span className={styles.qtyDisplay}>{item.quantity}</span>
                        <button
                          type="button"
                          className={styles.qtyBtn}
                          onClick={() => handleUpdateQuantity(idx, 1)}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>

                      <div className={styles.cartItemPrice}>₱${lineTotal}</div>

                      <button
                        type="button"
                        className={styles.cartItemRemove}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveItem(idx);
                        }}
                        aria-label="Remove item"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Numpad Toggle & Grid */}
            <div className={styles.numpadToggle}>
              <button
                type="button"
                id="btn-toggle-numpad"
                onClick={() => setShowNumpad(!showNumpad)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '11px',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>🔢</span>
                <span>{showNumpad ? 'Hide Tablet Numpad' : 'Show Tablet Numpad'}</span>
              </button>
            </div>

            {showNumpad && (
              <div className={styles.numpadGrid}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={styles.numpadKey}
                    onClick={() => handleNumpadPress(k)}
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}

            {/* Cart Totals Breakdown */}
            <div className={styles.cartTotals}>
              <div className={styles.totalRow}>
                <span>Items Count:</span>
                <strong>{totalItemsCount} units</strong>
              </div>
              <div className={styles.totalRow}>
                <span>Subtotal:</span>
                <span>₱${cartSubtotal.toFixed(2)}</span>
              </div>
              <div className={styles.totalRow}>
                <span>Facility Sales Tax (Included):</span>
                <span>₱0.00</span>
              </div>
              <div className={styles.grandTotalRow}>
                <span>TOTAL DUE:</span>
                <span className={styles.grandTotalAmount}>
                  ₱${cartSubtotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className={styles.cartActions}>
              <button
                type="button"
                id="btn-charge-now"
                className={styles.btnCharge}
                disabled={cart.length === 0}
                onClick={handleOpenCheckout}
              >
                <span>⚡ Charge Now</span>
                <span>(${cartSubtotal.toFixed(2)})</span>
              </button>

              <button
                type="button"
                id="btn-save-court-tab"
                className={styles.btnSaveTab}
                disabled={cart.length === 0}
                onClick={handleSaveOpenTab}
              >
                📂 Save & Attach to Court Tab
              </button>
            </div>
          </div>
        </div>

        {/* ── Active Open Tabs Drawer / Modal ── */}
        {isOpenTabsDrawerOpen && (
          <div className={adminStyles.modalBackdrop}>
            <div className={adminStyles.modalCard} role="dialog" aria-modal="true" style={{ maxWidth: '640px' }}>
              <div className={adminStyles.modalHeader}>
                <div>
                  <h2 className={adminStyles.modalTitle}>Active Court Tabs</h2>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Open customer tabs currently running in the facility
                  </span>
                </div>
                <button
                  type="button"
                  className={adminStyles.modalClose}
                  onClick={() => setIsOpenTabsDrawerOpen(false)}
                >
                  ✕
                </button>
              </div>

              {openTabs.length === 0 ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No open court tabs right now. Tabs opened by staff will appear here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '420px', overflowY: 'auto' }}>
                  {openTabs.map((tab) => (
                    <div
                      key={tab.id}
                      style={{
                        background: 'var(--color-bg-raised)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                          {tab.courtName || 'Court General Tab'}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          Customer: {tab.playerName} {tab.playerPhone ? `· ${tab.playerPhone}` : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          {tab.itemsCount} items · Opened {new Date(tab.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <strong style={{ fontSize: 'var(--text-base)', color: 'var(--color-brand-400)', marginRight: 'var(--space-2)' }}>
                          ${parseFloat(tab.totalAmount).toFixed(2)}
                        </strong>

                        <button
                          type="button"
                          id={`btn-load-tab-${tab.id.slice(0, 6)}`}
                          onClick={() => handleLoadTabToCart(tab)}
                          style={{
                            background: 'var(--color-brand-500)',
                            color: '#000',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '11px',
                            padding: '6px 10px',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                          }}
                        >
                          Load to POS
                        </button>

                        <button
                          type="button"
                          onClick={() => handleVoidTab(tab.id)}
                          style={{
                            background: 'transparent',
                            color: 'var(--color-error)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            fontSize: '11px',
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                          }}
                        >
                          Void
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                <Button type="button" variant="ghost" onClick={() => setIsOpenTabsDrawerOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Payment Checkout Modal ── */}
        {isPaymentModalOpen && (
          <div className={adminStyles.modalBackdrop}>
            <div className={adminStyles.modalCard} role="dialog" aria-modal="true" style={{ maxWidth: '480px' }}>
              <div className={adminStyles.modalHeader}>
                <div>
                  <h2 className={adminStyles.modalTitle}>Counter Checkout</h2>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    Total Amount Due: <strong style={{ color: 'var(--color-brand-400)' }}>₱${cartSubtotal.toFixed(2)}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  className={adminStyles.modalClose}
                  onClick={() => setIsPaymentModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              {paymentError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--color-error)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                  {paymentError}
                </div>
              )}

              <form onSubmit={handleCompleteCheckout} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {/* Payment Method Switcher */}
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    id="btn-pos-pay-cash"
                    onClick={() => setPaymentMethod('CASH')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      border: paymentMethod === 'CASH' ? '2px solid var(--color-brand-500)' : '1px solid var(--color-border)',
                      background: paymentMethod === 'CASH' ? 'rgba(34, 197, 94, 0.15)' : 'var(--color-bg-raised)',
                      color: paymentMethod === 'CASH' ? 'var(--color-brand-400)' : 'var(--color-text-secondary)',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    💵 Cash
                  </button>
                  <button
                    type="button"
                    id="btn-pos-pay-ewallet"
                    onClick={() => setPaymentMethod('EWALLET')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      border: paymentMethod === 'EWALLET' ? '2px solid #3b82f6' : '1px solid var(--color-border)',
                      background: paymentMethod === 'EWALLET' ? 'rgba(59, 130, 246, 0.2)' : 'var(--color-bg-raised)',
                      color: paymentMethod === 'EWALLET' ? 'var(--ink-blue)' : 'var(--color-text-secondary)',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    📱 E-Wallet
                  </button>
                </div>

                {/* Cash Options */}
                {paymentMethod === 'CASH' && (
                  <div style={{ background: 'var(--color-bg-raised)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>
                        Quick Tender Amounts:
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[
                          { label: `Exact ($${cartSubtotal.toFixed(2)})`, val: cartSubtotal.toFixed(2) },
                          { label: '₱100', val: '100' },
                          { label: '₱500', val: '500' },
                          { label: '₱1000', val: '1000' },
                        ].map((btn) => (
                          <button
                            key={btn.label}
                            type="button"
                            onClick={() => setCashTendered(btn.val)}
                            style={{
                              flex: 1,
                              background: 'var(--color-bg-surface)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '6px 4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'var(--color-text-primary)',
                              cursor: 'pointer',
                            }}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', alignItems: 'center' }}>
                      <Input
                        id="input-cash-tendered-modal"
                        label="Cash Tendered (₱)"
                        type="number"
                        step="0.01"
                        min="0"
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        required
                      />

                      <div style={{ background: 'var(--color-bg-surface)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', textAlign: 'right' }}>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block' }}>CHANGE DUE</span>
                        <strong style={{ fontSize: 'var(--text-lg)', color: changeDueDisplay >= 0 ? 'var(--color-brand-400)' : 'var(--color-text-muted)' }}>
                          ₱${changeDueDisplay.toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* E-Wallet Options */}
                {paymentMethod === 'EWALLET' && (
                  <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                      <div style={{ width: '60px', height: '60px', background: '#fff', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 900, fontSize: '10px', textAlign: 'center', padding: '4px' }}>
                        QR CODE SKELETON
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)' }}>
                        <strong style={{ color: 'var(--ink-blue)', display: 'block' }}>PicklePunto Pay (GCash / Maya)</strong>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Mobile / Merchant: +1 (555) 742-5537</span>
                        <span style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '10px' }}>
                          Amount: ₱${cartSubtotal.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <Input
                      id="input-ewallet-ref-modal"
                      label="Transaction Reference #"
                      placeholder="e.g. EW-982143"
                      value={ewalletReference}
                      onChange={(e) => setEwalletReference(e.target.value)}
                      required={paymentMethod === 'EWALLET'}
                    />
                  </div>
                )}

                {/* Digital Receipt Email Option */}
                <Input
                  id="input-receipt-email"
                  label="Email Digital Receipt (Optional)"
                  type="email"
                  placeholder="player@example.com"
                  value={receiptEmail}
                  onChange={(e) => setReceiptEmail(e.target.value)}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                  <Button type="button" variant="ghost" onClick={() => setIsPaymentModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    id="btn-confirm-checkout"
                    type="submit"
                    variant="primary"
                    loading={isProcessingPayment}
                  >
                    ✓ Complete Sale & Issue Receipt
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Receipt View & Thermal Print Modal (@media print) ── */}
        {activeReceipt && (
          <div className={`${adminStyles.modalBackdrop} ${styles.receiptPrintContainer}`}>
            <div className={adminStyles.modalCard} role="dialog" aria-modal="true" style={{ maxWidth: '420px', background: 'transparent', boxShadow: 'none' }}>
              {/* Paper Receipt Box */}
              <div className={styles.receiptPaper} id="printable-receipt-card">
                <div className={styles.receiptHeader}>
                  <h1 className={styles.receiptBrandTitle}>🏓 PICKLEPUNTO</h1>
                  <div className={styles.receiptMeta}>Sports Club & Pro Shop</div>
                  <div className={styles.receiptMeta}>
                    {new Date(activeReceipt.date).toLocaleString()}
                  </div>
                  <div className={styles.receiptMeta}>
                    Receipt: <strong>{activeReceipt.receiptNumber}</strong>
                  </div>
                </div>

                <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                  {activeReceipt.courtName && (
                    <div>Court: <strong>{activeReceipt.courtName}</strong></div>
                  )}
                  <div>Customer: <strong>{activeReceipt.customerName}</strong></div>
                  {activeReceipt.customerEmail && (
                    <div>Email: {activeReceipt.customerEmail}</div>
                  )}
                </div>

                <table className={styles.receiptTable}>
                  <thead>
                    <tr>
                      <th>ITEM</th>
                      <th style={{ textAlign: 'center' }}>QTY</th>
                      <th style={{ textAlign: 'right' }}>PRICE</th>
                      <th style={{ textAlign: 'right' }}>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeReceipt.items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.name}</td>
                        <td style={{ textAlign: 'center' }}>{i.quantity}</td>
                        <td style={{ textAlign: 'right' }}>₱${i.unitPrice}</td>
                        <td style={{ textAlign: 'right' }}>₱${i.lineTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <hr className={styles.receiptDivider} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '14px', margin: '4px 0' }}>
                  <span>TOTAL DUE:</span>
                  <span>₱${activeReceipt.totalAmount}</span>
                </div>

                <div style={{ fontSize: '11px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Payment Method:</span>
                    <span>{activeReceipt.paymentMethod}</span>
                  </div>
                  {activeReceipt.cashTendered && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Cash Tendered:</span>
                      <span>₱${activeReceipt.cashTendered}</span>
                    </div>
                  )}
                  {activeReceipt.changeDue && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                      <span>Change Due:</span>
                      <span>₱${activeReceipt.changeDue}</span>
                    </div>
                  )}
                  {activeReceipt.paymentReference && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '10px' }}>
                      <span>Ref / Notes:</span>
                      <span>{activeReceipt.paymentReference}</span>
                    </div>
                  )}
                </div>

                <div className={styles.receiptFooter}>
                  <div>Thank you for visiting PicklePunto!</div>
                  <div style={{ fontSize: '10px', marginTop: '2px' }}>See you on the court!</div>
                </div>
              </div>

              {/* Action Buttons (Hidden when printing via .noPrint) */}
              <div className={styles.noPrint} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                {emailSuccessMsg && (
                  <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid var(--color-brand-500)', color: 'var(--color-brand-400)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', textAlign: 'center' }}>
                    {emailSuccessMsg}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Button
                    id="btn-print-receipt"
                    variant="primary"
                    style={{ flex: 1 }}
                    onClick={handlePrintReceipt}
                  >
                    🖨️ Print Receipt
                  </Button>
                  <Button
                    id="btn-email-receipt"
                    variant="secondary"
                    style={{ flex: 1 }}
                    loading={emailingReceipt}
                    onClick={handleSendEmailReceipt}
                  >
                    📧 Email Receipt
                  </Button>
                </div>

                <Button
                  id="btn-done-receipt"
                  variant="ghost"
                  onClick={() => {
                    setActiveReceipt(null);
                    setEmailSuccessMsg(null);
                  }}
                >
                  Done / Next Customer
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Minus, ShoppingBag, ChevronLeft, Check, MapPin, Phone, User, Banknote, CreditCard, Circle, CheckCircle2, Menu, X, Home, MessageCircle, ClipboardList, Flame, TriangleAlert, Loader2 } from "lucide-react";

// ---- Backend ----
const API_BASE = "https://zewadty.onrender.com";

// ---- Design tokens (this restaurant: "Kefi" — Mediterranean grill) ----
const ink = "#241E20";
const paper = "#FBF7F0";
const aubergine = "#3B2140";
const aubergineText = "#EFE6F0";
const saffron = "#E39A3D";
const saffronText = "#4A2E08";
const sage = "#6E8B67";
const rust = "#B4472A";
const rustBg = "#F7E7E1";
const cardBorder = "#E7DFD2";
const muted500 = "#8B8172";

const FONT_DISPLAY = "'Fraunces', serif";
const FONT_BODY = "'Public Sans', sans-serif";
const FONT_MONO = "'IBM Plex Mono', monospace";

// nutritionFlags follow Israel's red-label system (high sugar / sodium / saturated fat)
const NUTRITION_LABELS = { sugar: "High in sugar", sodium: "High in sodium", fat: "High in saturated fat" };

// Extra display-only content the backend doesn't store yet (photos/copy/allergen info).
// Matched to real menu items by name once they're fetched from the API.
const MENU_CONTENT_BY_NAME = {
  "Lamb Kefta Wrap": { color: "#D9A05B", heating: "Arrives hot and ready to eat. To reheat: 10 min in a 180°C / 350°F oven, or 60 sec microwave.", ingredients: "Lamb, flatbread, tahini, pickled turnip, onion, parsley, sumac.", allergens: "Contains sesame, gluten.", nutrition: ["fat"] },
  "Chicken Shawarma Plate": { color: "#C97B4A", heating: "Arrives hot and ready to eat. To reheat: 10 min in a 180°C / 350°F oven, or 90 sec microwave.", ingredients: "Chicken thigh, rice, garlic sauce, tomato, cucumber, cabbage.", allergens: "Contains egg (in garlic sauce), may contain dairy.", nutrition: ["sodium"] },
  "Falafel Bowl": { color: "#8FA35E", heating: "Falafel arrives hot; hummus and tabbouleh are served cold. To reheat falafel only: 60 sec microwave.", ingredients: "Chickpeas, herbs, hummus, bulgur, parsley, tomato, tahini.", allergens: "Contains sesame. Vegan.", nutrition: [] },
  "Crispy Halloumi": { color: "#E6C36A", heating: "Best eaten fresh. To reheat: 3–4 min in a hot pan, no oil needed.", ingredients: "Halloumi cheese, date molasses.", allergens: "Contains dairy.", nutrition: ["sodium", "fat"] },
  "Batata Harra": { color: "#C2854B", heating: "Arrives hot. To reheat: 8 min in a 200°C / 400°F oven for best crispness.", ingredients: "Potato, garlic, cilantro, chili, olive oil.", allergens: "None of the major allergens. Vegan.", nutrition: ["sodium"] },
  "Mint Lemonade": { color: "#7DAE7E", heating: "Served cold — no reheating needed.", ingredients: "Lemon, mint, sugar, soda water.", allergens: "None of the major allergens.", nutrition: ["sugar"] },
  "Turkish Coffee": { color: "#6B4A3A", heating: "Served hot, ready to drink on arrival.", ingredients: "Finely ground coffee, cardamom, sugar on request.", allergens: "None of the major allergens.", nutrition: [] },
};
const DEFAULT_CONTENT = { color: "#B7AE9C", heating: "Details coming soon.", ingredients: "Details coming soon.", allergens: "Details coming soon.", nutrition: [] };

function money(n) { return `$${n.toFixed(2)}`; }

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export default function App() {
  const [screen, setScreen] = useState("menu"); // menu | cart | checkout | status | product | contact | orders
  const [activeCat, setActiveCat] = useState("Mains");
  const [cart, setCart] = useState({}); // { [backendItemId]: qty }
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState(null); // "cash" | "card"
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [returnScreen, setReturnScreen] = useState("menu");

  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");

  const [placedOrder, setPlacedOrder] = useState(null); // { orderId, orderNumber }
  const [liveStatus, setLiveStatus] = useState(null);   // polled from backend

  const loadMenu = useCallback(async () => {
    setMenuLoading(true);
    setMenuError("");
    try {
      const items = await apiFetch("/menu");
      const merged = items.map((item) => {
        const content = MENU_CONTENT_BY_NAME[item.name] || DEFAULT_CONTENT;
        return { ...item, ...content };
      });
      setMenuItems(merged);
    } catch (err) {
      setMenuError("Couldn't load the menu. The server may be waking up — try again in a moment.");
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  // Poll order status once an order has been placed and we're on the status screen.
  useEffect(() => {
    if (screen !== "status" || !placedOrder) return;
    let cancelled = false;
    async function poll() {
      try {
        const data = await apiFetch(`/orders/${placedOrder.orderId}?phone=${encodeURIComponent(phone)}`);
        if (!cancelled) setLiveStatus(data);
      } catch {
        // transient poll failures are fine — try again next tick
      }
    }
    poll();
    const id = setInterval(poll, 6000);
    return () => { cancelled = true; clearInterval(id); };
  }, [screen, placedOrder, phone]);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = menuItems.find((m) => String(m.id) === String(id));
    return sum + (item ? item.price * qty : 0);
  }, 0);

  function addItem(id) {
    const item = menuItems.find((m) => String(m.id) === String(id));
    const current = cart[id] || 0;
    if (item && current >= item.stockCount) return; // don't let cart exceed real stock
    setCart((c) => ({ ...c, [id]: current + 1 }));
  }
  function removeItem(id) {
    setCart((c) => {
      const next = { ...c };
      if (!next[id]) return next;
      next[id] -= 1;
      if (next[id] <= 0) delete next[id];
      return next;
    });
  }

  function goCheckout() {
    if (cartCount === 0) return;
    setScreen("checkout");
  }

  async function submitOrder() {
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setFormError("Fill in your name, phone, and delivery address.");
      return;
    }
    if (!payment) {
      setFormError("Choose how you'll pay.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      const items = Object.entries(cart).map(([menuItemId, qty]) => ({ menuItemId: Number(menuItemId), qty }));
      const result = await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({ customerName: name, phone, address, paymentMethod: payment, items }),
      });
      setPlacedOrder(result);
      setCart({});
      setScreen("status");
      loadMenu(); // refresh stock counts now that this order decremented them
    } catch (err) {
      if (err.status === 409) {
        setFormError(`${err.data?.error || "An item just sold out."} Please update your cart.`);
        loadMenu();
      } else if (err.status === 402) {
        setFormError(err.data?.error || "Your card was declined. Try again or pay cash on delivery.");
      } else {
        setFormError(err.message || "Something went wrong placing your order. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function openProduct(id, from) {
    setSelectedProductId(id);
    setReturnScreen(from);
    setScreen("product");
  }

  const navLinks = [
    { key: "menu", label: "Home page", icon: Home },
    { key: "contact", label: "Contact us", icon: MessageCircle },
    { key: "orders", label: "My orders", icon: ClipboardList },
  ];

  return (
    <div style={{ fontFamily: FONT_BODY, background: "#DED5C4", minHeight: "100vh", display: "flex", justifyContent: "center", padding: "32px 16px" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" />
      <div style={{ width: 390, background: paper, borderRadius: 28, overflow: "hidden", boxShadow: "0 20px 50px rgba(36,30,32,0.25)", display: "flex", flexDirection: "column", minHeight: 780, position: "relative" }}>

        {screen === "menu" && (
          <MenuScreen
            activeCat={activeCat} setActiveCat={setActiveCat}
            menuItems={menuItems} menuLoading={menuLoading} menuError={menuError} onRetry={loadMenu}
            cart={cart} addItem={addItem} removeItem={removeItem}
            cartCount={cartCount} cartTotal={cartTotal}
            onOpenCart={() => setScreen("cart")}
            onOpenNav={() => setNavOpen(true)}
            onOpenProduct={(id) => openProduct(id, "menu")}
          />
        )}

        {screen === "cart" && (
          <CartScreen
            cart={cart} menuItems={menuItems} addItem={addItem} removeItem={removeItem}
            cartTotal={cartTotal}
            onBack={() => setScreen("menu")}
            onCheckout={goCheckout}
          />
        )}

        {screen === "checkout" && (
          <CheckoutScreen
            name={name} setName={setName}
            phone={phone} setPhone={setPhone}
            address={address} setAddress={setAddress}
            payment={payment} setPayment={setPayment}
            cartTotal={cartTotal}
            formError={formError}
            submitting={submitting}
            onBack={() => setScreen("cart")}
            onSubmit={submitOrder}
          />
        )}

        {screen === "status" && (
          <StatusScreen placedOrder={placedOrder} liveStatus={liveStatus} payment={payment} cartTotal={cartTotal} />
        )}

        {screen === "product" && (
          <ProductScreen
            product={menuItems.find((m) => String(m.id) === String(selectedProductId))}
            cart={cart} addItem={addItem} removeItem={removeItem}
            onBack={() => setScreen(returnScreen)}
          />
        )}

        {screen === "contact" && <ContactScreen onBack={() => setScreen("menu")} />}

        {screen === "orders" && <OrdersScreen onBack={() => setScreen("menu")} onBrowse={() => setScreen("menu")} />}

        {navOpen && (
          <NavDrawer links={navLinks} active={screen} onSelect={(key) => { setScreen(key); setNavOpen(false); }} onClose={() => setNavOpen(false)} />
        )}

      </div>
    </div>
  );
}

// ---------- Nav drawer ----------
function NavDrawer({ links, active, onSelect, onClose }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(36,30,32,0.4)" }} />
      <div style={{ position: "relative", width: "76%", maxWidth: 280, background: aubergine, color: aubergineText, padding: "24px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 20 }}>Kefi</span>
          <button onClick={onClose} aria-label="Close menu" style={{ border: "none", background: "none", cursor: "pointer", color: aubergineText, display: "flex", padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = active === link.key;
          return (
            <button
              key={link.key}
              onClick={() => onSelect(link.key)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 10px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left", background: isActive ? "rgba(255,255,255,0.12)" : "transparent", color: aubergineText, fontFamily: FONT_BODY, fontWeight: 500, fontSize: 14.5 }}
            >
              <Icon size={17} />
              {link.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Menu ----------
function MenuScreen({ activeCat, setActiveCat, menuItems, menuLoading, menuError, onRetry, cart, addItem, removeItem, cartCount, cartTotal, onOpenCart, onOpenNav, onOpenProduct }) {
  const categories = [...new Set(menuItems.map((m) => m.category))];
  const items = menuItems.filter((m) => m.category === activeCat);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ background: aubergine, padding: "28px 20px 20px", color: aubergineText, position: "relative" }}>
        <button onClick={onOpenNav} aria-label="Open menu" style={{ position: "absolute", top: 24, right: 18, border: "none", background: "rgba(255,255,255,0.12)", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: aubergineText }}>
          <Menu size={18} />
        </button>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.7, fontWeight: 500 }}>Delivery only</p>
        <h1 style={{ margin: "4px 0 2px", fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 32 }}>Kefi</h1>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>Mediterranean grill, brought to your door</p>
      </div>

      {menuLoading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: muted500 }}>
          <Loader2 size={22} className="spin" style={{ animation: "spin 1s linear infinite" }} />
          <p style={{ fontSize: 13, margin: 0 }}>Loading the menu…</p>
          <style>{"@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }"}</style>
        </div>
      )}

      {!menuLoading && menuError && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "0 30px", textAlign: "center" }}>
          <TriangleAlert size={22} color={rust} />
          <p style={{ fontSize: 13, color: "#4A4238", margin: 0 }}>{menuError}</p>
          <button onClick={onRetry} style={{ marginTop: 6, padding: "9px 18px", borderRadius: 12, border: "none", background: saffron, color: saffronText, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      )}

      {!menuLoading && !menuError && (
        <>
          <div style={{ display: "flex", gap: 8, padding: "16px 20px 4px", flexWrap: "wrap" }}>
            {categories.map((c) => (
              <button key={c} onClick={() => setActiveCat(c)} style={{ border: "none", cursor: "pointer", padding: "8px 16px", borderRadius: 20, fontFamily: FONT_BODY, fontWeight: 500, fontSize: 13, background: activeCat === c ? aubergine : "#EFE9DD", color: activeCat === c ? aubergineText : ink }}>
                {c}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px", paddingBottom: cartCount > 0 ? 96 : 24 }}>
            {items.map((item) => {
              const qty = cart[item.id] || 0;
              const outOfStock = item.stockCount === 0;
              return (
                <div key={item.id} style={{ display: "flex", gap: 12, padding: "14px 0", borderBottom: `1px solid ${cardBorder}`, cursor: "pointer", opacity: outOfStock ? 0.55 : 1 }} onClick={() => onOpenProduct(item.id)}>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: item.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 16, color: ink }}>{item.name}</p>
                    <p style={{ margin: "2px 0 6px", fontSize: 12.5, color: "#726A5E", lineHeight: 1.4 }}>{item.description}</p>
                    <p style={{ margin: 0, fontFamily: FONT_MONO, fontWeight: 500, fontSize: 13, color: saffronText }}>
                      {money(item.price)} {outOfStock && <span style={{ color: rust, fontWeight: 600 }}>· Sold out</span>}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                    {outOfStock ? null : qty === 0 ? (
                      <button onClick={() => addItem(item.id)} aria-label={`Add ${item.name}`} style={{ width: 34, height: 34, borderRadius: "50%", border: "none", cursor: "pointer", background: saffron, color: saffronText, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Plus size={16} />
                      </button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F1E9DA", borderRadius: 20, padding: "4px 6px" }}>
                        <button onClick={() => removeItem(item.id)} aria-label={`Remove ${item.name}`} style={{ width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer", background: paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Minus size={14} color={ink} />
                        </button>
                        <span style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 13, minWidth: 12, textAlign: "center" }}>{qty}</span>
                        <button onClick={() => addItem(item.id)} aria-label={`Add another ${item.name}`} style={{ width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer", background: saffron, color: saffronText, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {cartCount > 0 && (
        <button onClick={onOpenCart} style={{ position: "absolute", left: 16, right: 16, bottom: 16, background: aubergine, color: aubergineText, border: "none", borderRadius: 18, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", boxShadow: "0 10px 24px rgba(59,33,64,0.35)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 14 }}>
            <span style={{ position: "relative", display: "flex" }}>
              <ShoppingBag size={18} />
              <span style={{ position: "absolute", top: -8, right: -8, background: rust, color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>
            </span>
            View cart
          </span>
          <span style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 14 }}>{money(cartTotal)}</span>
        </button>
      )}
    </div>
  );
}

// ---------- Cart ----------
function CartScreen({ cart, menuItems, addItem, removeItem, cartTotal, onBack, onCheckout }) {
  const entries = Object.entries(cart);
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <TopBar title="Your cart" onBack={onBack} />
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
        {entries.length === 0 && <p style={{ color: "#726A5E", fontSize: 14, marginTop: 40, textAlign: "center" }}>Your cart is empty.</p>}
        {entries.map(([id, qty]) => {
          const item = menuItems.find((m) => String(m.id) === String(id));
          if (!item) return null;
          return (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: `1px solid ${cardBorder}` }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: item.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 15 }}>{item.name}</p>
                <p style={{ margin: "2px 0 0", fontFamily: FONT_MONO, fontSize: 12.5, color: saffronText }}>{money(item.price * qty)}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F1E9DA", borderRadius: 20, padding: "4px 6px" }}>
                <button onClick={() => removeItem(id)} aria-label={`Remove one ${item.name}`} style={{ width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer", background: paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Minus size={14} color={ink} />
                </button>
                <span style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 13, minWidth: 12, textAlign: "center" }}>{qty}</span>
                <button onClick={() => addItem(id)} aria-label={`Add another ${item.name}`} style={{ width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer", background: saffron, color: saffronText, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${cardBorder}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 14, color: "#726A5E" }}>Total</span>
          <span style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 16 }}>{money(cartTotal)}</span>
        </div>
        <button onClick={onCheckout} disabled={entries.length === 0} style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: entries.length === 0 ? "#D8CFC0" : saffron, color: saffronText, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 15, cursor: entries.length === 0 ? "default" : "pointer" }}>
          Go to checkout
        </button>
      </div>
    </div>
  );
}

// ---------- Checkout ----------
function CheckoutScreen({ name, setName, phone, setPhone, address, setAddress, payment, setPayment, cartTotal, formError, submitting, onBack, onSubmit }) {
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${cardBorder}`, fontFamily: FONT_BODY, fontSize: 14, background: "#fff", color: ink };
  const labelStyle = { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500, color: "#726A5E", marginBottom: 6 };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <TopBar title="Checkout" onBack={onBack} />
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}><User size={13} /> Name</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}><Phone size={13} /> Phone</label>
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-0100" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}><MapPin size={13} /> Delivery address</label>
          <input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, unit, gate code" />
        </div>

        <p style={{ ...labelStyle, marginBottom: 10 }}>How will you pay?</p>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <PayOption active={payment === "cash"} onClick={() => setPayment("cash")} icon={<Banknote size={18} />} label="Cash on delivery" />
          <PayOption active={payment === "card"} onClick={() => setPayment("card")} icon={<CreditCard size={18} />} label="Card" />
        </div>

        {payment === "card" && (
          <p style={{ fontSize: 12, color: muted500, margin: "-10px 0 16px" }}>
            Card charging isn't fully wired up yet — the server accepts it in test mode for now.
          </p>
        )}

        {formError && <p style={{ color: rust, fontSize: 13, margin: "0 0 12px" }}>{formError}</p>}
      </div>
      <div style={{ padding: 20, borderTop: `1px solid ${cardBorder}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 14, color: "#726A5E" }}>Total</span>
          <span style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 16 }}>{money(cartTotal)}</span>
        </div>
        <button onClick={onSubmit} disabled={submitting} style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: submitting ? "#D8CFC0" : saffron, color: saffronText, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 15, cursor: submitting ? "default" : "pointer" }}>
          {submitting ? "Placing order…" : "Place order"}
        </button>
      </div>
    </div>
  );
}

function PayOption({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 8px", borderRadius: 14, cursor: "pointer", border: active ? `2px solid ${aubergine}` : `1px solid ${cardBorder}`, background: active ? "#F1E9DA" : "#fff", color: ink, fontFamily: FONT_BODY, fontWeight: 500, fontSize: 12.5 }}>
      {icon}
      {label}
    </button>
  );
}

// ---------- Product detail ----------
function ProductScreen({ product, cart, addItem, removeItem, onBack }) {
  if (!product) return null;
  const qty = cart[product.id] || 0;
  const outOfStock = product.stockCount === 0;
  const rowStyle = { display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 0", borderBottom: `1px solid ${cardBorder}` };
  const labelStyle = { margin: 0, fontSize: 12, fontWeight: 600, color: "#726A5E", textTransform: "uppercase", letterSpacing: 0.6 };
  const bodyStyle = { margin: "3px 0 0", fontSize: 13.5, color: ink, lineHeight: 1.5 };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <TopBar title="" onBack={onBack} />
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
        <div style={{ width: "100%", height: 180, borderRadius: 18, background: product.color, marginBottom: 16 }} />
        <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 22, color: ink }}>{product.name}</h2>
        <p style={{ margin: "4px 0 14px", fontFamily: FONT_MONO, fontWeight: 500, fontSize: 15, color: saffronText }}>
          {money(product.price)} {outOfStock && <span style={{ color: rust }}>· Sold out</span>}
        </p>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "#726A5E", lineHeight: 1.5 }}>{product.description}</p>

        <div style={rowStyle}>
          <Flame size={16} color={muted500} style={{ marginTop: 2, flexShrink: 0 }} />
          <div><p style={labelStyle}>How to heat it</p><p style={bodyStyle}>{product.heating}</p></div>
        </div>
        <div style={rowStyle}>
          <div style={{ width: 16, flexShrink: 0 }} />
          <div><p style={labelStyle}>Ingredients</p><p style={bodyStyle}>{product.ingredients}</p></div>
        </div>
        <div style={rowStyle}>
          <TriangleAlert size={16} color={rust} style={{ marginTop: 2, flexShrink: 0 }} />
          <div><p style={labelStyle}>Allergens</p><p style={bodyStyle}>{product.allergens}</p></div>
        </div>

        <div style={{ padding: "12px 0" }}>
          <p style={labelStyle}>Nutritional labeling (סימון תזונתי)</p>
          {product.nutrition.length === 0 ? (
            <p style={bodyStyle}>No red warning labels apply to this item.</p>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {product.nutrition.map((flag) => (
                <span key={flag} style={{ display: "flex", alignItems: "center", gap: 6, background: rustBg, color: rust, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 20 }}>
                  <TriangleAlert size={13} /> {NUTRITION_LABELS[flag]}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: 20, borderTop: `1px solid ${cardBorder}` }}>
        {outOfStock ? (
          <div style={{ width: "100%", padding: "14px", borderRadius: 16, background: "#F1E9DA", color: muted500, textAlign: "center", fontFamily: FONT_BODY, fontWeight: 600, fontSize: 14 }}>
            Sold out right now
          </div>
        ) : qty === 0 ? (
          <button onClick={() => addItem(product.id)} style={{ width: "100%", padding: "14px", borderRadius: 16, border: "none", background: saffron, color: saffronText, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
            Add to cart — {money(product.price)}
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F1E9DA", borderRadius: 16, padding: "8px 10px" }}>
            <button onClick={() => removeItem(product.id)} aria-label="Remove one" style={{ width: 38, height: 38, borderRadius: "50%", border: "none", cursor: "pointer", background: paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Minus size={16} color={ink} />
            </button>
            <span style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 15 }}>{qty} in cart</span>
            <button onClick={() => addItem(product.id)} aria-label="Add another" style={{ width: 38, height: 38, borderRadius: "50%", border: "none", cursor: "pointer", background: saffron, color: saffronText, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Plus size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Contact us ----------
function ContactScreen({ onBack }) {
  const rowStyle = { display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: `1px solid ${cardBorder}` };
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <TopBar title="Contact us" onBack={onBack} />
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
        <p style={{ fontSize: 13.5, color: "#726A5E", lineHeight: 1.5, margin: "0 0 12px" }}>Questions about an order, an allergy, or delivery? Reach us any of these ways.</p>
        <div style={rowStyle}><Phone size={17} color={muted500} /><div><p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: ink }}>Call or text</p><p style={{ margin: 0, fontSize: 13, color: "#726A5E" }}>(555) 010-2200</p></div></div>
        <div style={rowStyle}><MessageCircle size={17} color={muted500} /><div><p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: ink }}>Email</p><p style={{ margin: 0, fontSize: 13, color: "#726A5E" }}>hello@kefi-delivery.com</p></div></div>
        <div style={rowStyle}><MapPin size={17} color={muted500} /><div><p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: ink }}>Kitchen location</p><p style={{ margin: 0, fontSize: 13, color: "#726A5E" }}>Delivery only — no walk-in counter</p></div></div>
      </div>
    </div>
  );
}

// ---------- My orders ----------
function OrdersScreen({ onBack, onBrowse }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <TopBar title="My orders" onBack={onBack} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 30px", textAlign: "center" }}>
        <ClipboardList size={30} color={muted500} style={{ marginBottom: 10 }} />
        <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 17, color: ink }}>No past orders yet</p>
        <p style={{ margin: "6px 0 18px", fontSize: 13, color: "#726A5E" }}>Orders you place will show up here.</p>
        <button onClick={onBrowse} style={{ padding: "12px 22px", borderRadius: 14, border: "none", background: saffron, color: saffronText, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>
          Browse the menu
        </button>
      </div>
    </div>
  );
}

// ---------- Status (kitchen-ticket signature element) ----------
const STAGES = [
  { key: "received", label: "Order received" },
  { key: "preparing", label: "Preparing" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];

function StatusScreen({ placedOrder, liveStatus, payment, cartTotal }) {
  if (!placedOrder) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 30 }}>
        <p style={{ fontSize: 13, color: muted500, textAlign: "center" }}>No order placed yet.</p>
      </div>
    );
  }

  const status = liveStatus?.status || "received";
  const currentIndex = Math.max(0, STAGES.findIndex((s) => s.key === status));
  const total = liveStatus ? liveStatus.subtotal : cartTotal;
  const payMethod = liveStatus ? liveStatus.paymentMethod : payment;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", padding: "36px 20px 28px" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: sage, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <Check size={26} color={paper} />
      </div>
      <p style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 22, textAlign: "center" }}>Order placed</p>
      <p style={{ margin: "4px 0 24px", fontSize: 13, color: "#726A5E" }}>We'll text you as it moves along</p>

      <div style={{ width: "100%", background: "#fff", border: `1px solid ${cardBorder}`, borderRadius: 18, padding: "20px 20px 22px", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "#726A5E", letterSpacing: 1 }}>ORDER</span>
          <span style={{ fontFamily: FONT_MONO, fontWeight: 500, fontSize: 18 }}>#{placedOrder.orderNumber}</span>
        </div>

        {STAGES.map((stage, i) => {
          const done = i <= currentIndex;
          const isLast = i === STAGES.length - 1;
          return (
            <div key={stage.key} style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                {done ? <CheckCircle2 size={18} color={sage} /> : <Circle size={18} color={cardBorder} />}
                {!isLast && <div style={{ width: 1.5, flex: 1, minHeight: 22, background: done ? sage : cardBorder, margin: "2px 0" }} />}
              </div>
              <p style={{ margin: "0 0 20px", fontSize: 13.5, fontWeight: done ? 600 : 400, color: done ? ink : "#A69C8D", fontFamily: FONT_BODY }}>{stage.label}</p>
            </div>
          );
        })}

        <div style={{ borderTop: `1px dashed ${cardBorder}`, paddingTop: 14, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "#726A5E" }}>{payMethod === "cash" ? "Pay cash on delivery" : "Paid by card"}</span>
          <span style={{ fontFamily: FONT_MONO, fontWeight: 500 }}>{money(total)}</span>
        </div>
      </div>
    </div>
  );
}

function TopBar({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "20px 16px 12px" }}>
      <button onClick={onBack} aria-label="Back" style={{ border: "none", background: "none", cursor: "pointer", display: "flex", padding: 4 }}>
        <ChevronLeft size={22} color={ink} />
      </button>
      <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 19, color: ink }}>{title}</h2>
    </div>
  );
}

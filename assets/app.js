// ===== Небольшой оверлей ошибок вместо "белого экрана" =====
function showErrorOverlay(err) {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = '';
  const box = document.createElement('div');
  box.id = 'error-overlay';
  box.textContent = `Ошибка: ${err && (err.stack || err.message) ? (err.stack || err.message) : String(err)}`;
  root.appendChild(box);
}
window.addEventListener('error', (e) => showErrorOverlay(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showErrorOverlay(e.reason));

// ===== Импорты из CDN как ESM (с явными deps чтобы не ломалось) =====
import React from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import htm from 'https://esm.sh/htm@3?deps=react@18';

// Не external — пусть esm.sh подтянет зависимости и jsx-runtime сам
import { motion, AnimatePresence } from 'https://esm.sh/framer-motion@11?deps=react@18,react-dom@18';
import {
  Search, MapPin, Star, Scissors, Stethoscope, Clock, Calendar, Phone,
  Upload, Download, Plus, X, CheckCircle2
} from 'https://esm.sh/lucide-react@0.451.0?deps=react@18';

// react-leaflet вместе с leaflet как deps
import {
  MapContainer, TileLayer, CircleMarker, Popup
} from 'https://esm.sh/react-leaflet@4?deps=react@18,react-dom@18,leaflet@1.9.4';

// Leaflet JS (для корректной инициализации окружения, иконок и т.п.)
import 'https://esm.sh/leaflet@1.9.4';

import Papa from 'https://esm.sh/papaparse@5';

// htm-привязка под React без JSX/бандлера
const html = htm.bind(React.createElement);
const { useMemo, useState } = React;

/** ==== Демо-данные ==== */
const SAMPLE_PROVIDERS = [
  {
    id: "p1",
    name: "Ювента — ветклиника (Кировский)",
    type: "vet",
    district: "Кировский",
    address: "ул. Победы, 12",
    rating: 4.8,
    reviewsCount: 214,
    is24x7: true,
    homeVisit: false,
    verifiedDocs: true,
    services: [
      { name: "Вакцинация кошек", priceMin: 1500, priceMax: 2300 },
      { name: "УЗИ", priceMin: 1800, priceMax: 3200 },
    ],
    workingHours: { mon: [{ open: "00:00", close: "23:59" }] },
    slots: [
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    ],
    coords: [57.6261, 39.8845],
    phone: "+7 900 000-00-00",
  },
  {
    id: "p2",
    name: "YarGroom — салон груминга",
    type: "grooming",
    district: "Заволжский",
    address: "пр. Машиностроителей, 5",
    rating: 4.7,
    reviewsCount: 163,
    is24x7: false,
    homeVisit: true,
    verifiedDocs: true,
    services: [
      { name: "Комплекс для малых пород", priceMin: 1200, priceMax: 2200 },
      { name: "Стрижка когтей", priceMin: 300, priceMax: 500 },
    ],
    workingHours: {
      mon: [{ open: "09:00", close: "20:00" }],
      tue: [{ open: "09:00", close: "20:00" }],
      wed: [{ open: "09:00", close: "20:00" }],
      thu: [{ open: "09:00", close: "20:00" }],
      fri: [{ open: "09:00", close: "20:00" }],
      sat: [{ open: "10:00", close: "18:00" }],
    },
    slots: [
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(),
    ],
    coords: [57.6502, 39.8061],
    phone: "+7 900 111-22-33",
  },
];

/** ==== Утилиты ==== */
const currency = (n) =>
  typeof n === "number"
    ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(n)
    : "—";

const districts = [
  "Дзержинский", "Заволжский", "Кировский",
  "Красноперекопский", "Ленинский", "Фрунзенский", "Другой",
];

function isOpenNow(hours, is24x7) {
  if (is24x7) return true;
  if (!hours) return false;
  const now = new Date();
  const dayNames = ["sun","mon","tue","wed","thu","fri","sat"];
  const todayKey = dayNames[now.getDay()];
  const intervals = (hours || {})[todayKey];
  if (!intervals) return false;
  const minsNow = now.getHours() * 60 + now.getMinutes();
  return intervals.some(({ open, close }) => {
    const [oh, om] = open.split(":").map(Number);
    const [ch, cm] = close.split(":").map(Number);
    const start = oh * 60 + om;
    const end = ch * 60 + cm;
    return minsNow >= start && minsNow <= end;
  });
}

function nearestSlotISO(slots) {
  if (!Array.isArray(slots) || !slots.length) return undefined;
  const upcoming = slots
    .map((s) => new Date(s))
    .filter((d) => d.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0]?.toISOString();
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ==== Приложение ==== */
function App() {
  const [providers, setProviders] = useState(SAMPLE_PROVIDERS);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // "all" | "vet" | "grooming"
  const [districtFilter, setDistrictFilter] = useState("all");
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [is247, setIs247] = useState(false);
  const [homeVisit, setHomeVisit] = useState(false);
  const [sortBy, setSortBy] = useState("slot"); // "slot" | "rating"
  const [showAdd, setShowAdd] = useState(false);
  const [bookingProvider, setBookingProvider] = useState(null);

  const markers = useMemo(
    () => providers.filter((p) => Array.isArray(p.coords) && p.coords.length === 2),
    [providers]
  );

  const center = useMemo(() => {
    if (!markers.length) return [57.6261, 39.8845]; // Ярославль
    const avgLat = markers.reduce((s, p) => s + (p.coords?.[0] || 0), 0) / markers.length;
    const avgLng = markers.reduce((s, p) => s + (p.coords?.[1] || 0), 0) / markers.length;
    return [avgLat, avgLng];
  }, [markers]);

  const filtered = useMemo(() => {
    let list = providers.filter((p) => {
      if (type !== "all" && p.type !== type) return false;
      if (districtFilter !== "all" && p.district !== districtFilter) return false;
      if (openNowOnly && !isOpenNow(p.workingHours, p.is24x7)) return false;
      if (is247 && !p.is24x7) return false;
      if (homeVisit && !p.homeVisit) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const inText =
          p.name.toLowerCase().includes(q) ||
          (p.address || "").toLowerCase().includes(q) ||
          (p.services || []).some((s) => (s.name || "").toLowerCase().includes(q));
        if (!inText) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      const as = Date.parse(nearestSlotISO(a.slots) || "2100-01-01");
      const bs = Date.parse(nearestSlotISO(b.slots) || "2100-01-01");
      return as - bs;
    });

    return list;
  }, [providers, query, type, districtFilter, openNowOnly, is247, homeVisit, sortBy]);

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data)) throw new Error("Ожидался массив провайдеров");
        setProviders(data);
      } catch (e) {
        alert("Ошибка импорта: " + (e?.message || e));
      }
    };
    reader.readAsText(file);
  }

  function importCSV(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const res = Papa.parse(text, { header: true, skipEmptyLines: true });
        const rows = res?.data || [];
        const parsed = rows.map((row, idx) => {
          const coords =
            typeof row.coords === "string" && row.coords.includes(",")
              ? row.coords.split(",").map((v) => parseFloat(v.trim()))
              : undefined;

          const services =
            typeof row.services === "string" && row.services.length
              ? row.services.split(";").map((t) => {
                  const [namePart, pricePart] = t.split(":").map((s) => s?.trim());
                  const clean = (s) => s.replace(/[^0-9-]/g, "");
                  let priceMin, priceMax;
                  if (pricePart) {
                    if (pricePart.includes("-")) {
                      const [a, b] = clean(pricePart).split("-").map((x) => Number(x));
                      priceMin = Number.isFinite(a) ? a : undefined;
                      priceMax = Number.isFinite(b) ? b : undefined;
                    } else {
                      const v = Number(clean(pricePart));
                      priceMin = Number.isFinite(v) ? v : undefined;
                    }
                  }
                  return { name: namePart || "Услуга", priceMin, priceMax };
                })
              : [];

          const slots =
            typeof row.slots === "string" && row.slots.length
              ? row.slots
                  .split("|")
                  .map((s) => new Date(s).toISOString())
                  .filter((s) => !isNaN(new Date(s).getTime()))
              : [];

          return {
            id: row.id || `csv_${idx}_${Math.random().toString(36).slice(2)}`,
            name: row.name || "Без названия",
            type: String(row.type).toLowerCase().includes("groom") ? "grooming" : "vet",
            district: row.district || "Другой",
            address: row.address || "",
            phone: row.phone || "",
            is24x7: String(row.is24x7).toLowerCase() === "true" || row.is24x7 === "1",
            homeVisit: String(row.homeVisit).toLowerCase() === "true" || row.homeVisit === "1",
            verifiedDocs: String(row.verifiedDocs).toLowerCase() === "true" || row.verifiedDocs === "1",
            rating: row.rating ? Number(row.rating) : undefined,
            reviewsCount: row.reviewsCount ? Number(row.reviewsCount) : undefined,
            services,
            slots,
            coords,
            workingHours: {},
          };
        });
        setProviders(parsed);
      } catch (e) {
        alert("Ошибка импорта CSV: " + (e?.message || e));
      }
    };
    reader.readAsText(file);
  }

  function downloadCSVTemplate() {
    const header = [
      "id","name","type","district","address","phone",
      "is24x7","homeVisit","verifiedDocs","rating","reviewsCount",
      "coords","services","slots"
    ].join(",");
    const row1 = [
      "p100","Ювента — ветклиника","vet","Кировский","ул. Победы, 12","+7 900 000-00-00",
      "1","0","1","4.8","214",
      "\"57.6261,39.8845\"",
      "\"Вакцинация кошек:1500-2300; УЗИ:1800-3200\"",
      "\"2025-08-14T10:30:00|2025-08-14T12:00:00\""
    ].join(",");
    const row2 = [
      "p101","YarGroom — салон груминга","grooming","Заволжский","пр. Машиностроителей, 5","+7 900 111-22-33",
      "0","1","1","4.7","163",
      "\"57.6502,39.8061\"",
      "\"Комплекс малые породы:1200-2200; Стрижка когтей:300-500\"",
      "\"2025-08-14T11:00:00|2025-08-14T15:30:00\""
    ].join(",");
    const csv = [header, row1, row2].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "providers_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(providers, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "providers.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return html`
    <div className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-20 bg-white/80 border-b">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-2xl bg-black text-white grid place-items-center">
              <${Stethoscope} className="size-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
              Пет-сервис Ярославль — Вет & Груминг
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="px-3 py-2 rounded-xl border bg-white cursor-pointer flex items-center gap-2">
              <${Upload} className="size-4" /> Импорт JSON
              <input type="file" accept="application/json" className="hidden"
                onChange=${(e) => e.target.files && importJSON(e.target.files[0])} />
            </label>
            <label className="px-3 py-2 rounded-xl border bg-white cursor-pointer flex items-center gap-2">
              <${Upload} className="size-4" /> Импорт CSV
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange=${(e) => e.target.files && importCSV(e.target.files[0])} />
            </label>
            <button onClick=${exportJSON}
              className="px-3 py-2 rounded-xl border bg-white flex items-center gap-2 hover:shadow">
              <${Download} className="size-4" /> Экспорт
            </button>
            <button onClick=${downloadCSVTemplate}
              className="px-3 py-2 rounded-xl border bg-white flex items-center gap-2 hover:shadow">
              <${Download} className="size-4" /> Шаблон CSV
            </button>
            <button onClick=${() => setShowAdd(true)}
              className="px-3 py-2 rounded-xl bg-black text-white rounded-2xl flex items-center gap-2 hover:opacity-90">
              <${Plus} className="size-4" /> Добавить исполнителя
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border p-4 space-y-4">
            <div>
              <label className="text-sm text-neutral-600">Поиск</label>
              <div className="mt-1 relative">
                <${Search} className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
                <input value=${query} onChange=${(e) => setQuery(e.target.value)}
                  placeholder="Услуга, адрес или название"
                  className="w-full pl-10 pr-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-black/20" />
              </div>
            </div>

            <div>
              <label className="text-sm text-neutral-600">Тип</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button onClick=${() => setType("all")}
                  className=${`px-3 py-2 rounded-xl border ${type === "all" ? "bg-black text-white" : "bg-white"}`}>Все</button>
                <button onClick=${() => setType("vet")}
                  className=${`px-3 py-2 rounded-xl border flex items-center justify-center gap-2 ${type === "vet" ? "bg-black text-white" : "bg-white"}`}>
                  <${Stethoscope} className="size-4" /> Вет
                </button>
                <button onClick=${() => setType("grooming")}
                  className=${`px-3 py-2 rounded-xl border flex items-center justify-center gap-2 ${type === "grooming" ? "bg-black text-white" : "bg-white"}`}>
                  <${Scissors} className="size-4" /> Грум
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-neutral-600">Район</label>
              <select value=${districtFilter} onChange=${(e) => setDistrictFilter(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border bg-white">
                <option value="all">Все районы</option>
                ${districts.map((d) => html`<option key=${d} value=${d}>${d}</option>`)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked=${openNowOnly} onChange=${(e) => setOpenNowOnly(e.target.checked)} />
                Открыто сейчас
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked=${is247} onChange=${(e) => setIs247(e.target.checked)} />
                24/7
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked=${homeVisit} onChange=${(e) => setHomeVisit(e.target.checked)} />
                Выезд на дом
              </label>
              <div>
                <label className="text-sm text-neutral-600">Сортировка</label>
                <select value=${sortBy} onChange=${(e) => setSortBy(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl border bg-white">
                  <option value="slot">Ближайший слот</option>
                  <option value="rating">Рейтинг</option>
                </select>
              </div>
            </div>

            <div className="rounded-xl bg-neutral-50 border p-3 text-xs text-neutral-600">
              <b>Как загрузить данные?</b>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Импорт JSON или CSV вверху.</li>
                <li>CSV: <code>id,name,type,district,address,phone,is24x7,homeVisit,verifiedDocs,rating,reviewsCount,coords,services,slots</code>.</li>
                <li><code>coords</code>= "lat,lng"; <code>services</code>= "Название:1000-2000; Другая:500-700"; <code>slots</code>= ISO через «|».</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="h-72 rounded-2xl overflow-hidden border shadow-sm bg-white map-card">
            <${MapContainer} center=${center} zoom=${12} style=${{ height: "100%", width: "100%" }}>
              <${TileLayer} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              ${markers.map((p) =>
                p.coords ? html`
                  <${CircleMarker} key=${p.id} center=${p.coords} radius=${8}>
                    <${Popup}>
                      <div className="text-sm">
                        <div className="font-semibold">${p.name}</div>
                        <div className="text-neutral-600">${p.address}</div>
                        <div className="mt-1">${(p.services?.[0]?.name) || "Услуги не указаны"}</div>
                        <button className="mt-2 px-2 py-1 rounded-lg border" onClick=${() => setBookingProvider(p)}>Записаться</button>
                      </div>
                    </${Popup}>
                  </${CircleMarker}>
                ` : null
              )}
            </${MapContainer}>
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <${AnimatePresence}>
              ${filtered.map((p) => {
                const next = nearestSlotISO(p.slots);
                return html`
                  <${motion.div}
                    key=${p.id}
                    layout
                    initial=${{ opacity: 0, y: 10 }}
                    animate=${{ opacity: 1, y: 0 }}
                    exit=${{ opacity: 0, y: -10 }}
                    className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col"
                  >
                    <div className="h-28 bg-gradient-to-br from-neutral-50 to-white grid grid-cols-3 gap-1 p-2">
                      ${Array.from({ length: 3 }).map((_, i) => html`
                        <div key=${i} className="rounded-xl bg-neutral-100/70 border"></div>
                      `)}
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold leading-tight">${p.name}</h3>
                          <div className="text-xs text-neutral-500 flex items-center gap-1 mt-1">
                            <${MapPin} className="size-3" /> ${p.district || "—"} · ${p.address}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-amber-500">
                          <${Star} className="size-4" />
                          <span className="text-sm font-medium">${p.rating?.toFixed?.(1) ?? "—"}</span>
                          <span className="text-xs text-neutral-400">(${p.reviewsCount || 0})</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        ${(p.services || []).slice(0, 3).map((s, idx) => html`
                          <span key=${idx} className="px-2 py-1 rounded-full border bg-neutral-50">
                            ${s.name} · ${currency(s.priceMin)}${s.priceMax ? `–${currency(s.priceMax)}` : ""}
                          </span>
                        `)}
                        ${(p.services || []).length > 3 && html`
                          <span className="px-2 py-1 rounded-full border bg-neutral-50">
                            +${(p.services || []).length - 3} услуг
                          </span>
                        `}
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        ${p.type === "vet" ? html`
                          <span className="px-2 py-1 rounded-full border flex items-center gap-1">
                            <${Stethoscope} className="size-3" /> Ветклиника
                          </span>
                        ` : html`
                          <span className="px-2 py-1 rounded-full border flex items-center gap-1">
                            <${Scissors} className="size-3" /> Груминг
                          </span>
                        `}
                        ${p.is24x7 && html`
                          <span className="px-2 py-1 rounded-full border flex items-center gap-1">
                            <${Clock} className="size-3" /> 24/7
                          </span>
                        `}
                        ${p.homeVisit && html`
                          <span className="px-2 py-1 rounded-full border flex items-center gap-1">🚗 Выезд</span>
                        `}
                        ${p.verifiedDocs && html`
                          <span className="px-2 py-1 rounded-full border flex items-center gap-1 text-emerald-600">
                            <${CheckCircle2} className="size-3" /> Проверено
                          </span>
                        `}
                      </div>

                      <div className="mt-auto">
                        <div className="text-xs text-neutral-500 flex items-center gap-2">
                          <${Calendar} className="size-3" /> Ближайшее: ${formatDateTime(next)}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button onClick=${() => setBookingProvider(p)}
                            className="px-3 py-2 rounded-xl bg-black text-white hover:opacity-90">
                            Записаться
                          </button>
                          ${p.phone && html`
                            <a href=${`tel:${(p.phone || "").replace(/\s|\(|\)|-/g, "")}`}
                               className="px-3 py-2 rounded-xl border bg-white flex items-center gap-2">
                              <${Phone} className="size-4" /> Позвонить
                            </a>
                          `}
                        </div>
                      </div>
                    </div>
                  </${motion.div}>
                `;
              })}
            </${AnimatePresence}>
          </div>

          ${filtered.length === 0 && html`
            <div className="text-center text-neutral-500 text-sm py-10">
              Ничего не найдено. Измените фильтры или загрузите данные.
            </div>
          `}
        </div>
      </div>

      <${AnimatePresence}>
        ${showAdd && html`
          <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
            <div className="bg-white max-w-2xl w-full rounded-2xl p-4 border shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Добавить исполнителя</h3>
                <button onClick=${() => setShowAdd(false)} className="p-2">
                  <${X} className="size-5" />
                </button>
              </div>
              ${html`<${SimpleAddForm} onAdd=${(p) => { setProviders((prev) => [...prev, p]); setShowAdd(false); }} />`}
            </div>
          </div>
        `}
      </${AnimatePresence}>

      <${AnimatePresence}>
        ${bookingProvider && html`
          <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
            <div className="bg-white max-w-lg w-full rounded-2xl p-4 border shadow-lg">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Запись — ${bookingProvider.name}</h3>
                <button onClick=${() => setBookingProvider(null)} className="p-2">
                  <${X} className="size-5" />
                </button>
              </div>
              <p className="text-sm text-neutral-600 mt-1">Выберите ближайшее время. (Демо — без оплаты.)</p>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                ${(bookingProvider.slots || []).slice(0, 9).map((s) => html`
                  <button key=${s} onClick=${() => { alert(`Бронь создана на ${formatDateTime(s)} (демо).`); setBookingProvider(null); }}
                          className="px-3 py-2 rounded-xl border hover:bg-neutral-50">
                    ${formatDateTime(s)}
                  </button>
                `)}
              </div>
            </div>
          </div>
        `}
      </${AnimatePresence}>

      <footer className="py-10 text-center text-xs text-neutral-500">
        Шаблон маркетплейса (React + Tailwind, без сборки). Импортируйте свои данные JSON/CSV.
      </footer>
    </div>
  `;
}

function SimpleAddForm({ onAdd }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("vet");
  const [district, setDistrict] = useState("Кировский");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [is247, setIs247] = useState(false);
  const [homeVisit, setHomeVisit] = useState(false);

  return html`
    <form className="mt-3 grid grid-cols-2 gap-3" onSubmit=${(e) => {
      e.preventDefault();
      onAdd({
        id: "p_" + Math.random().toString(36).slice(2),
        name, type, district, address, phone,
        is24x7: is247, homeVisit,
        services: [], workingHours: {}, slots: []
      });
    }}>
      <div className="col-span-2 grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-neutral-600">Название</label>
          <input required value=${name} onChange=${(e) => setName(e.target.value)}
                 className="mt-1 w-full px-3 py-2 rounded-xl border" />
        </div>
        <div>
          <label className="text-sm text-neutral-600">Тип</label>
          <select value=${type} onChange=${(e) => setType(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl border bg-white">
            <option value="vet">Ветклиника</option>
            <option value="grooming">Груминг</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-sm text-neutral-600">Район</label>
        <select value=${district} onChange=${(e) => setDistrict(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border bg-white">
          ${districts.map((d) => html`<option key=${d} value=${d}>${d}</option>`)}
        </select>
      </div>

      <div>
        <label className="text-sm text-neutral-600">Телефон</label>
        <input value=${phone} onChange=${(e) => setPhone(e.target.value)}
               className="mt-1 w-full px-3 py-2 rounded-xl border" />
      </div>

      <div className="col-span-2">
        <label className="text-sm text-neutral-600">Адрес</label>
        <input value=${address} onChange=${(e) => setAddress(e.target.value)}
               className="mt-1 w-full px-3 py-2 rounded-xl border" />
      </div>

      <div className="col-span-2 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked=${is247} onChange=${(e) => setIs247(e.target.checked)} /> 24/7
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked=${homeVisit} onChange=${(e) => setHomeVisit(e.target.checked)} /> Выезд на дом
        </label>
      </div>

      <div className="col-span-2 flex justify-end gap-2 mt-2">
        <button type="button" className="px-3 py-2 rounded-xl border"
          onClick=${() => { setName(""); setAddress(""); setPhone(""); }}>
          Очистить
        </button>
        <button type="submit" className="px-3 py-2 rounded-xl bg-black text-white">Добавить</button>
      </div>
    </form>
  `;
}

// Монтаж приложения
try {
  createRoot(document.getElementById('root')).render(html`<${React.StrictMode}><${App} /></${React.StrictMode}>`);
} catch (err) {
  showErrorOverlay(err);
}

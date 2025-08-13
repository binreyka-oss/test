// @ts-nocheck
import React, { useMemo, useState } from 'https://esm.sh/react?dev';
import { motion, AnimatePresence } from 'https://esm.sh/framer-motion?dev';
import { Search, MapPin, Star, Scissors, Stethoscope, Clock, Calendar, Phone, Upload, Download, Plus, X, CheckCircle2, } from 'https://esm.sh/lucide-react?dev';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'https://esm.sh/react-leaflet?dev';
import 'https://esm.sh/leaflet@1.9.4/dist/leaflet.css';
import Papa from 'https://esm.sh/papaparse?dev';
// Пример стартовых данных (можно удалить)
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
// Утилиты
const currency = (n) => typeof n === "number"
    ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(n)
    : "—";
const districts = [
    "Дзержинский",
    "Заволжский",
    "Кировский",
    "Красноперекопский",
    "Ленинский",
    "Фрунзенский",
    "Другой",
];
function isOpenNow(hours, is24x7) {
    if (is24x7)
        return true;
    if (!hours)
        return false;
    const now = new Date();
    const dayNames = [
        "sun",
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat",
    ];
    const todayKey = dayNames[now.getDay()];
    const intervals = hours[todayKey];
    if (!intervals)
        return false;
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
    if (!slots || !slots.length)
        return undefined;
    const upcoming = slots
        .map((s) => new Date(s))
        .filter((d) => d.getTime() > Date.now())
        .sort((a, b) => a.getTime() - b.getTime());
    return upcoming[0]?.toISOString();
}
function formatDateTime(iso) {
    if (!iso)
        return "—";
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}
// ================================
// Главный компонент
// ================================
export default function VetGroomMarketplaceTemplate() {
    const [providers, setProviders] = useState(SAMPLE_PROVIDERS);
    const [query, setQuery] = useState("");
    const [type, setType] = useState("all");
    const [districtFilter, setDistrictFilter] = useState("all");
    const [openNow, setOpenNow] = useState(false);
    const [is247, setIs247] = useState(false);
    const [homeVisit, setHomeVisit] = useState(false);
    const [sortBy, setSortBy] = useState("slot");
    const [showAdd, setShowAdd] = useState(false);
    const [bookingProvider, setBookingProvider] = useState(null);
    // Маркеры на карте и центр (рассчитываем по coords)
    const markers = useMemo(() => providers.filter((p) => Array.isArray(p.coords) &&
        typeof p.coords[0] === "number" &&
        typeof p.coords[1] === "number"), [providers]);
    const center = useMemo(() => {
        if (!markers.length)
            return [57.6261, 39.8845]; // Ярославль по умолчанию
        const avgLat = markers.reduce((s, p) => s + (p.coords[0] || 0), 0) / markers.length;
        const avgLng = markers.reduce((s, p) => s + (p.coords[1] || 0), 0) / markers.length;
        return [avgLat, avgLng];
    }, [markers]);
    // Фильтрация и сортировка
    const filtered = useMemo(() => {
        let list = providers.filter((p) => {
            if (type !== "all" && p.type !== type)
                return false;
            if (districtFilter !== "all" && p.district !== districtFilter)
                return false;
            if (openNow && !isOpenNow(p.workingHours, p.is24x7))
                return false;
            if (is247 && !p.is24x7)
                return false;
            if (homeVisit && !p.homeVisit)
                return false;
            if (query.trim()) {
                const q = query.toLowerCase();
                const inText = p.name.toLowerCase().includes(q) ||
                    p.address.toLowerCase().includes(q) ||
                    p.services.some((s) => s.name.toLowerCase().includes(q));
                if (!inText)
                    return false;
            }
            return true;
        });
        list = list.sort((a, b) => {
            if (sortBy === "rating")
                return (b.rating || 0) - (a.rating || 0);
            const as = nearestSlotISO(a.slots)?.valueOf() ?? Infinity;
            const bs = nearestSlotISO(b.slots)?.valueOf() ?? Infinity;
            return as - bs;
        });
        return list;
    }, [providers, query, type, districtFilter, openNow, is247, homeVisit, sortBy]);
    // Импорт JSON
    function importJSON(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(String(reader.result));
                if (!Array.isArray(data))
                    throw new Error("Ожидался массив провайдеров");
                setProviders(data);
            }
            catch (e) {
                alert("Ошибка импорта: " + e.message);
            }
        };
        reader.readAsText(file);
    }
    // Импорт CSV (Papaparse)
    function importCSV(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const text = String(reader.result || "");
                const res = Papa.parse(text, { header: true, skipEmptyLines: true });
                const rows = res?.data || [];
                const parsed = rows.map((row, idx) => {
                    const coords = typeof row.coords === "string" && row.coords.includes(",")
                        ? row.coords.split(",").map((v) => parseFloat(v.trim()))
                        : undefined;
                    const services = typeof row.services === "string" && row.services.length
                        ? row.services.split(";").map((t) => {
                            const [namePart, pricePart] = t.split(":").map((s) => s?.trim());
                            const clean = (s) => s.replace(/[^0-9-]/g, "");
                            let priceMin = undefined;
                            let priceMax = undefined;
                            if (pricePart) {
                                if (pricePart.includes("-")) {
                                    const [a, b] = clean(pricePart).split("-").map((x) => Number(x));
                                    priceMin = isFinite(a) ? a : undefined;
                                    priceMax = isFinite(b) ? b : undefined;
                                }
                                else {
                                    const v = Number(clean(pricePart));
                                    priceMin = isFinite(v) ? v : undefined;
                                }
                            }
                            return { name: namePart || "Услуга", priceMin, priceMax };
                        })
                        : [];
                    const slots = typeof row.slots === "string" && row.slots.length
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
                        is24x7: row.is24x7 === "1" || String(row.is24x7).toLowerCase() === "true",
                        homeVisit: row.homeVisit === "1" || String(row.homeVisit).toLowerCase() === "true",
                        verifiedDocs: row.verifiedDocs === "1" || String(row.verifiedDocs).toLowerCase() === "true",
                        rating: row.rating ? Number(row.rating) : undefined,
                        reviewsCount: row.reviewsCount ? Number(row.reviewsCount) : undefined,
                        services,
                        slots,
                        coords,
                        workingHours: {},
                    };
                });
                setProviders(parsed);
            }
            catch (e) {
                alert("Ошибка импорта CSV: " + e.message);
            }
        };
        reader.readAsText(file);
    }
    // Скачать шаблон CSV
    function downloadCSVTemplate() {
        const header = [
            "id",
            "name",
            "type",
            "district",
            "address",
            "phone",
            "is24x7",
            "homeVisit",
            "verifiedDocs",
            "rating",
            "reviewsCount",
            "coords",
            "services",
            "slots",
        ].join(",");
        const row1 = [
            "p100",
            "Ювента — ветклиника",
            "vet",
            "Кировский",
            "ул. Победы, 12",
            "+7 900 000-00-00",
            "1",
            "0",
            "1",
            "4.8",
            "214",
            '"57.6261,39.8845"',
            '"Вакцинация кошек:1500-2300; УЗИ:1800-3200"',
            '"2025-08-14T10:30:00|2025-08-14T12:00:00"',
        ].join(",");
        const row2 = [
            "p101",
            "YarGroom — салон груминга",
            "grooming",
            "Заволжский",
            "пр. Машиностроителей, 5",
            "+7 900 111-22-33",
            "0",
            "1",
            "1",
            "4.7",
            "163",
            '"57.6502,39.8061"',
            '"Комплекс малые породы:1200-2200; Стрижка когтей:300-500"',
            '"2025-08-14T11:00:00|2025-08-14T15:30:00"',
        ].join(",");
        const csv = [header, row1, row2].join("\n"); // corrected newline
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "providers_template.csv";
        a.click();
        URL.revokeObjectURL(url);
    }
    // Экспорт JSON
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
    return (React.createElement("div", { className: "min-h-screen bg-neutral-50" },
        React.createElement("header", { className: "sticky top-0 z-20 bg-white/80 backdrop-blur border-b" },
            React.createElement("div", { className: "mx-auto max-w-7xl px-4 py-3 flex items-center gap-3" },
                React.createElement("div", { className: "flex items-center gap-2" },
                    React.createElement("div", { className: "size-9 rounded-2xl bg-black text-white grid place-items-center" },
                        React.createElement(Stethoscope, { className: "size-5" })),
                    React.createElement("h1", { className: "text-xl sm:text-2xl font-semibold tracking-tight" }, "\u041F\u0435\u0442\u2011\u0441\u0435\u0440\u0432\u0438\u0441 \u042F\u0440\u043E\u0441\u043B\u0430\u0432\u043B\u044C \u2014 \u0412\u0435\u0442 & \u0413\u0440\u0443\u043C\u0438\u043D\u0433")),
                React.createElement("div", { className: "ml-auto flex items-center gap-2" },
                    React.createElement("label", { className: "px-3 py-2 rounded-xl border bg-white cursor-pointer flex items-center gap-2" },
                        React.createElement(Upload, { className: "size-4" }),
                        " \u0418\u043C\u043F\u043E\u0440\u0442 JSON",
                        React.createElement("input", { type: "file", accept: "application/json", className: "hidden", onChange: (e) => e.target.files && importJSON(e.target.files[0]) })),
                    React.createElement("label", { className: "px-3 py-2 rounded-xl border bg-white cursor-pointer flex items-center gap-2" },
                        React.createElement(Upload, { className: "size-4" }),
                        " \u0418\u043C\u043F\u043E\u0440\u0442 CSV",
                        React.createElement("input", { type: "file", accept: ".csv,text/csv", className: "hidden", onChange: (e) => e.target.files && importCSV(e.target.files[0]) })),
                    React.createElement("button", { onClick: exportJSON, className: "px-3 py-2 rounded-xl border bg-white flex items-center gap-2 hover:shadow" },
                        React.createElement(Download, { className: "size-4" }),
                        " \u042D\u043A\u0441\u043F\u043E\u0440\u0442"),
                    React.createElement("button", { onClick: downloadCSVTemplate, className: "px-3 py-2 rounded-xl border bg-white flex items-center gap-2 hover:shadow" },
                        React.createElement(Download, { className: "size-4" }),
                        " \u0428\u0430\u0431\u043B\u043E\u043D CSV"),
                    React.createElement("button", { onClick: () => setShowAdd(true), className: "px-3 py-2 rounded-xl bg-black text-white rounded-2xl flex items-center gap-2 hover:opacity-90" },
                        React.createElement(Plus, { className: "size-4" }),
                        " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F")))),
        React.createElement("div", { className: "mx-auto max-w-7xl px-4 py-4 grid grid-cols-1 lg:grid-cols-4 gap-4" },
            React.createElement("div", { className: "lg:col-span-1" },
                React.createElement("div", { className: "bg-white rounded-2xl shadow-sm border p-4 space-y-4" },
                    React.createElement("div", null,
                        React.createElement("label", { className: "text-sm text-neutral-600" }, "\u041F\u043E\u0438\u0441\u043A"),
                        React.createElement("div", { className: "mt-1 relative" },
                            React.createElement(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" }),
                            React.createElement("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "\u0423\u0441\u043B\u0443\u0433\u0430, \u0430\u0434\u0440\u0435\u0441 \u0438\u043B\u0438 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", className: "w-full pl-10 pr-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-black/20" }))),
                    React.createElement("div", null,
                        React.createElement("label", { className: "text-sm text-neutral-600" }, "\u0422\u0438\u043F"),
                        React.createElement("div", { className: "mt-2 grid grid-cols-3 gap-2" },
                            React.createElement("button", { onClick: () => setType("all"), className: `px-3 py-2 rounded-xl border ${type === "all" ? "bg-black text-white" : "bg-white"}` }, "\u0412\u0441\u0435"),
                            React.createElement("button", { onClick: () => setType("vet"), className: `px-3 py-2 rounded-xl border flex items-center justify-center gap-2 ${type === "vet" ? "bg-black text-white" : "bg-white"}` },
                                React.createElement(Stethoscope, { className: "size-4" }),
                                " \u0412\u0435\u0442"),
                            React.createElement("button", { onClick: () => setType("grooming"), className: `px-3 py-2 rounded-xl border flex items-center justify-center gap-2 ${type === "grooming" ? "bg-black text-white" : "bg-white"}` },
                                React.createElement(Scissors, { className: "size-4" }),
                                " \u0413\u0440\u0443\u043C"))),
                    React.createElement("div", null,
                        React.createElement("label", { className: "text-sm text-neutral-600" }, "\u0420\u0430\u0439\u043E\u043D"),
                        React.createElement("select", { value: districtFilter, onChange: (e) => setDistrictFilter(e.target.value), className: "mt-1 w-full px-3 py-2 rounded-xl border bg-white" },
                            React.createElement("option", { value: "all" }, "\u0412\u0441\u0435 \u0440\u0430\u0439\u043E\u043D\u044B"),
                            districts.map((d) => (React.createElement("option", { key: d, value: d }, d))))),
                    React.createElement("div", { className: "grid grid-cols-2 gap-2" },
                        React.createElement("label", { className: "flex items-center gap-2 text-sm" },
                            React.createElement("input", { type: "checkbox", checked: openNow, onChange: (e) => setOpenNow(e.target.checked) }),
                            "\u041E\u0442\u043A\u0440\u044B\u0442\u043E \u0441\u0435\u0439\u0447\u0430\u0441"),
                        React.createElement("label", { className: "flex items-center gap-2 text-sm" },
                            React.createElement("input", { type: "checkbox", checked: is247, onChange: (e) => setIs247(e.target.checked) }),
                            "24/7"),
                        React.createElement("label", { className: "flex items-center gap-2 text-sm" },
                            React.createElement("input", { type: "checkbox", checked: homeVisit, onChange: (e) => setHomeVisit(e.target.checked) }),
                            "\u0412\u044B\u0435\u0437\u0434 \u043D\u0430 \u0434\u043E\u043C"),
                        React.createElement("div", null,
                            React.createElement("label", { className: "text-sm text-neutral-600" }, "\u0421\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u043A\u0430"),
                            React.createElement("select", { value: sortBy, onChange: (e) => setSortBy(e.target.value), className: "mt-1 w-full px-3 py-2 rounded-xl border bg-white" },
                                React.createElement("option", { value: "slot" }, "\u0411\u043B\u0438\u0436\u0430\u0439\u0448\u0438\u0439 \u0441\u043B\u043E\u0442"),
                                React.createElement("option", { value: "rating" }, "\u0420\u0435\u0439\u0442\u0438\u043D\u0433")))),
                    React.createElement("div", { className: "rounded-xl bg-neutral-50 border p-3 text-xs text-neutral-600" },
                        React.createElement("b", null, "\u041A\u0430\u043A \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435?"),
                        React.createElement("ul", { className: "list-disc pl-5 mt-1 space-y-1" },
                            React.createElement("li", null, "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB\u0418\u043C\u043F\u043E\u0440\u0442 JSON\u00BB \u0438\u043B\u0438 \u00AB\u0418\u043C\u043F\u043E\u0440\u0442 CSV\u00BB \u0432\u0432\u0435\u0440\u0445\u0443."),
                            React.createElement("li", null,
                                "CSV: \u0441\u0442\u043E\u043B\u0431\u0446\u044B ",
                                React.createElement("code", null, "id,name,type,district,address,phone,is24x7,homeVisit,verifiedDocs,rating,reviewsCount,coords,services,slots"),
                                "."),
                            React.createElement("li", null,
                                React.createElement("code", null, "coords"),
                                " = \"lat,lng\"; ",
                                React.createElement("code", null, "services"),
                                " = \"\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435:1000-2000; \u0414\u0440\u0443\u0433\u0430\u044F:500-700\"; ",
                                React.createElement("code", null, "slots"),
                                " = ISO \u0447\u0435\u0440\u0435\u0437 \u00AB|\u00BB."),
                            React.createElement("li", null, "\u041C\u043E\u0436\u043D\u043E \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E \u0447\u0435\u0440\u0435\u0437 \u00AB\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F\u00BB."))))),
            React.createElement("div", { className: "lg:col-span-3 space-y-4" },
                React.createElement("div", { className: "h-72 rounded-2xl overflow-hidden border shadow-sm bg-white" },
                    React.createElement(MapContainer, { center: center, zoom: 12, style: { height: "100%", width: "100%" } },
                        React.createElement(TileLayer, { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "\u00A9 OpenStreetMap" }),
                        markers.map((p) => (p.coords ? (React.createElement(CircleMarker, { key: p.id, center: p.coords, radius: 8 },
                            React.createElement(Popup, null,
                                React.createElement("div", { className: "text-sm" },
                                    React.createElement("div", { className: "font-semibold" }, p.name),
                                    React.createElement("div", { className: "text-neutral-600" }, p.address),
                                    React.createElement("div", { className: "mt-1" }, p.services?.[0]?.name || "Услуги не указаны"),
                                    React.createElement("button", { className: "mt-2 px-2 py-1 rounded-lg border", onClick: () => setBookingProvider(p) }, "\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F"))))) : null)))),
                React.createElement("div", { className: "grid sm:grid-cols-2 xl:grid-cols-3 gap-4" },
                    React.createElement(AnimatePresence, null, filtered.map((p) => {
                        const open = isOpenNow(p.workingHours, p.is24x7);
                        const next = nearestSlotISO(p.slots);
                        return (React.createElement(motion.div, { key: p.id, layout: true, initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, className: "bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col" },
                            React.createElement("div", { className: "h-28 bg-gradient-to-br from-neutral-50 to-white grid grid-cols-3 gap-1 p-2" }, new Array(3).fill(0).map((_, i) => (React.createElement("div", { key: i, className: "rounded-xl bg-neutral-100/70 border" })))),
                            React.createElement("div", { className: "p-4 flex-1 flex flex-col gap-3" },
                                React.createElement("div", { className: "flex items-start justify-between gap-2" },
                                    React.createElement("div", null,
                                        React.createElement("h3", { className: "font-semibold leading-tight" }, p.name),
                                        React.createElement("div", { className: "text-xs text-neutral-500 flex items-center gap-1 mt-1" },
                                            React.createElement(MapPin, { className: "size-3" }),
                                            " ",
                                            p.district || "—",
                                            " \u00B7 ",
                                            p.address)),
                                    React.createElement("div", { className: "flex items-center gap-1 text-amber-500" },
                                        React.createElement(Star, { className: "size-4" }),
                                        React.createElement("span", { className: "text-sm font-medium" }, p.rating?.toFixed(1) || "—"),
                                        React.createElement("span", { className: "text-xs text-neutral-400" },
                                            "(",
                                            p.reviewsCount || 0,
                                            ")"))),
                                React.createElement("div", { className: "flex flex-wrap gap-2 text-xs" },
                                    p.services.slice(0, 3).map((s, idx) => (React.createElement("span", { key: idx, className: "px-2 py-1 rounded-full border bg-neutral-50" },
                                        s.name,
                                        " \u00B7 ",
                                        currency(s.priceMin),
                                        s.priceMax ? `–${currency(s.priceMax)}` : ""))),
                                    p.services.length > 3 && (React.createElement("span", { className: "px-2 py-1 rounded-full border bg-neutral-50" },
                                        "+",
                                        p.services.length - 3,
                                        " \u0443\u0441\u043B\u0443\u0433"))),
                                React.createElement("div", { className: "flex items-center gap-2 text-xs" },
                                    p.type === "vet" ? (React.createElement("span", { className: "px-2 py-1 rounded-full border flex items-center gap-1" },
                                        React.createElement(Stethoscope, { className: "size-3" }),
                                        " \u0412\u0435\u0442\u043A\u043B\u0438\u043D\u0438\u043A\u0430")) : (React.createElement("span", { className: "px-2 py-1 rounded-full border flex items-center gap-1" },
                                        React.createElement(Scissors, { className: "size-3" }),
                                        " \u0413\u0440\u0443\u043C\u0438\u043D\u0433")),
                                    p.is24x7 && (React.createElement("span", { className: "px-2 py-1 rounded-full border flex items-center gap-1" },
                                        React.createElement(Clock, { className: "size-3" }),
                                        " 24/7")),
                                    p.homeVisit && (React.createElement("span", { className: "px-2 py-1 rounded-full border flex items-center gap-1" }, "\uD83D\uDE97 \u0412\u044B\u0435\u0437\u0434")),
                                    p.verifiedDocs && (React.createElement("span", { className: "px-2 py-1 rounded-full border flex items-center gap-1 text-emerald-600" },
                                        React.createElement(CheckCircle2, { className: "size-3" }),
                                        " \u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E"))),
                                React.createElement("div", { className: "mt-auto" },
                                    React.createElement("div", { className: "text-xs text-neutral-500 flex items-center gap-2" },
                                        React.createElement(Calendar, { className: "size-3" }),
                                        " \u0411\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u0435: ",
                                        formatDateTime(next)),
                                    React.createElement("div", { className: "flex gap-2 mt-2" },
                                        React.createElement("button", { onClick: () => setBookingProvider(p), className: "px-3 py-2 rounded-xl bg-black text-white hover:opacity-90" }, "\u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F"),
                                        p.phone && (React.createElement("a", { href: `tel:${p.phone.replace(/\s|\(|\)|-/g, "")}`, className: "px-3 py-2 rounded-xl border bg-white flex items-center gap-2" },
                                            React.createElement(Phone, { className: "size-4" }),
                                            " \u041F\u043E\u0437\u0432\u043E\u043D\u0438\u0442\u044C")))))));
                    }))),
                filtered.length === 0 && (React.createElement("div", { className: "text-center text-neutral-500 text-sm py-10" }, "\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E. \u0418\u0437\u043C\u0435\u043D\u0438\u0442\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u044B \u0438\u043B\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435.")))),
        React.createElement(AnimatePresence, null, showAdd && (React.createElement(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, className: "fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" },
            React.createElement(motion.div, { initial: { scale: 0.98, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.98, opacity: 0 }, className: "bg-white max-w-2xl w-full rounded-2xl p-4 border shadow-lg" },
                React.createElement("div", { className: "flex items-center justify-between" },
                    React.createElement("h3", { className: "font-semibold" }, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F"),
                    React.createElement("button", { onClick: () => setShowAdd(false), className: "p-2" },
                        React.createElement(X, { className: "size-5" }))),
                React.createElement(SimpleAddForm, { onAdd: (p) => {
                        setProviders((prev) => [...prev, p]);
                        setShowAdd(false);
                    } }))))),
        React.createElement(AnimatePresence, null, bookingProvider && (React.createElement(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, className: "fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" },
            React.createElement(motion.div, { initial: { scale: 0.98, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.98, opacity: 0 }, className: "bg-white max-w-lg w-full rounded-2xl p-4 border shadow-lg" },
                React.createElement("div", { className: "flex items-center justify-between" },
                    React.createElement("h3", { className: "font-semibold" },
                        "\u0417\u0430\u043F\u0438\u0441\u044C \u2014 ",
                        bookingProvider.name),
                    React.createElement("button", { onClick: () => setBookingProvider(null), className: "p-2" },
                        React.createElement(X, { className: "size-5" }))),
                React.createElement("p", { className: "text-sm text-neutral-600 mt-1" }, "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0432\u0440\u0435\u043C\u044F. (\u0414\u0435\u043C\u043E \u2014 \u0431\u0435\u0437 \u043E\u043F\u043B\u0430\u0442\u044B.)"),
                React.createElement("div", { className: "mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2" }, (bookingProvider.slots || []).slice(0, 9).map((s) => (React.createElement("button", { key: s, onClick: () => {
                        alert(`Бронь создана на ${formatDateTime(s)} (демо). Подключите API записи/оплату.`);
                        setBookingProvider(null);
                    }, className: "px-3 py-2 rounded-xl border hover:bg-neutral-50" }, formatDateTime(s))))))))),
        React.createElement("footer", { className: "py-10 text-center text-xs text-neutral-500" }, "\u0428\u0430\u0431\u043B\u043E\u043D \u043C\u0430\u0440\u043A\u0435\u0442\u043F\u043B\u0435\u0439\u0441\u0430 (React + Tailwind). \u0418\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u0441\u0432\u043E\u0438 \u0434\u0430\u043D\u043D\u044B\u0435 JSON, \u043F\u0440\u0438 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E\u0441\u0442\u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043A\u0430\u0440\u0442\u044B \u0438 \u043E\u043F\u043B\u0430\u0442\u0443.")));
}
// Простейшая форма добавления исполнителя (минимум полей)
function SimpleAddForm({ onAdd }) {
    const [name, setName] = useState("");
    const [type, setType] = useState("vet");
    const [district, setDistrict] = useState("Кировский");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    const [is247, setIs247] = useState(false);
    const [homeVisit, setHomeVisit] = useState(false);
    return (React.createElement("form", { className: "mt-3 grid grid-cols-2 gap-3", onSubmit: (e) => {
            e.preventDefault();
            const newProvider = {
                id: "p_" + Math.random().toString(36).slice(2),
                name,
                type,
                district,
                address,
                phone,
                is24x7: is247,
                homeVisit,
                services: [],
                workingHours: {},
                slots: [],
            };
            onAdd(newProvider);
        } },
        React.createElement("div", { className: "col-span-2 grid grid-cols-2 gap-3" },
            React.createElement("div", null,
                React.createElement("label", { className: "text-sm text-neutral-600" }, "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435"),
                React.createElement("input", { required: true, value: name, onChange: (e) => setName(e.target.value), className: "mt-1 w-full px-3 py-2 rounded-xl border" })),
            React.createElement("div", null,
                React.createElement("label", { className: "text-sm text-neutral-600" }, "\u0422\u0438\u043F"),
                React.createElement("select", { value: type, onChange: (e) => setType(e.target.value), className: "mt-1 w-full px-3 py-2 rounded-xl border bg-white" },
                    React.createElement("option", { value: "vet" }, "\u0412\u0435\u0442\u043A\u043B\u0438\u043D\u0438\u043A\u0430"),
                    React.createElement("option", { value: "grooming" }, "\u0413\u0440\u0443\u043C\u0438\u043D\u0433")))),
        React.createElement("div", null,
            React.createElement("label", { className: "text-sm text-neutral-600" }, "\u0420\u0430\u0439\u043E\u043D"),
            React.createElement("select", { value: district, onChange: (e) => setDistrict(e.target.value), className: "mt-1 w-full px-3 py-2 rounded-xl border bg-white" }, districts.map((d) => (React.createElement("option", { key: d, value: d }, d))))),
        React.createElement("div", null,
            React.createElement("label", { className: "text-sm text-neutral-600" }, "\u0422\u0435\u043B\u0435\u0444\u043E\u043D"),
            React.createElement("input", { value: phone, onChange: (e) => setPhone(e.target.value), className: "mt-1 w-full px-3 py-2 rounded-xl border" })),
        React.createElement("div", { className: "col-span-2" },
            React.createElement("label", { className: "text-sm text-neutral-600" }, "\u0410\u0434\u0440\u0435\u0441"),
            React.createElement("input", { value: address, onChange: (e) => setAddress(e.target.value), className: "mt-1 w-full px-3 py-2 rounded-xl border" })),
        React.createElement("div", { className: "col-span-2 flex items-center gap-4" },
            React.createElement("label", { className: "flex items-center gap-2 text-sm" },
                React.createElement("input", { type: "checkbox", checked: is247, onChange: (e) => setIs247(e.target.checked) }),
                "24/7"),
            React.createElement("label", { className: "flex items-center gap-2 text-sm" },
                React.createElement("input", { type: "checkbox", checked: homeVisit, onChange: (e) => setHomeVisit(e.target.checked) }),
                "\u0412\u044B\u0435\u0437\u0434 \u043D\u0430 \u0434\u043E\u043C")),
        React.createElement("div", { className: "col-span-2 flex justify-end gap-2 mt-2" },
            React.createElement("button", { type: "button", onClick: () => (setName(""), setAddress(""), setPhone("")), className: "px-3 py-2 rounded-xl border" }, "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C"),
            React.createElement("button", { type: "submit", className: "px-3 py-2 rounded-xl bg-black text-white" }, "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"))));
}

/* ===== Kisan Kalyan - data layer (browser localStorage) ===== */
/*
  Everything is stored in ONE key in the browser: "kisanKalyanDB".
  This is our "database". It survives page refresh because localStorage
  keeps data on the device until it is cleared.
*/
var DB_KEY = "kisanKalyanDB";
var AVG_SERVICE_MIN = 10;   // average minutes to serve one farmer
var OTP_DEMO = "1234";      // fixed OTP for the prototype

/* Prices used to estimate payment amount (Rs per quintal - sample MSP-like values) */
var CROP_PRICE = { wheat: 2275, rice: 2300, maize: 2090, bajra: 2625, mustard: 5650 };

function _todayISO(offset) {
  var d = new Date();
  d.setDate(d.getDate() + (offset || 0));
  return d.toISOString().slice(0, 10);
}

/* ---- Seed data: procurement centres + a couple of demo bookings ---- */
function _seed() {
  var centres = [
    {
      id: "c1", name_en: "Karnal Mandi Procurement Centre", name_hi: "करनाल मंडी खरीद केंद्र",
      district_en: "Karnal, Haryana", district_hi: "करनाल, हरियाणा",
      address_en: "New Grain Market, Sector 3, Karnal", address_hi: "नया अनाज बाजार, सेक्टर 3, करनाल",
      crops: ["wheat", "rice", "mustard"], capacity: 8, open: "9:00 AM – 5:00 PM", distanceKm: 4
    },
    {
      id: "c2", name_en: "Ludhiana APMC Yard", name_hi: "लुधियाना ए.पी.एम.सी. यार्ड",
      district_en: "Ludhiana, Punjab", district_hi: "लुधियाना, पंजाब",
      address_en: "Gill Road APMC Market, Ludhiana", address_hi: "गिल रोड ए.पी.एम.सी. बाजार, लुधियाना",
      crops: ["wheat", "rice", "maize"], capacity: 10, open: "8:00 AM – 6:00 PM", distanceKm: 12
    },
    {
      id: "c3", name_en: "Nagpur Krishi Procurement Kendra", name_hi: "नागपुर कृषि खरीद केंद्र",
      district_en: "Nagpur, Maharashtra", district_hi: "नागपुर, महाराष्ट्र",
      address_en: "Cotton Market Road, Nagpur", address_hi: "कॉटन मार्केट रोड, नागपुर",
      crops: ["rice", "maize", "bajra"], capacity: 6, open: "9:00 AM – 4:00 PM", distanceKm: 9
    },
    {
      id: "c4", name_en: "Indore Choithram Mandi", name_hi: "इंदौर छोइथराम मंडी",
      district_en: "Indore, Madhya Pradesh", district_hi: "इंदौर, मध्य प्रदेश",
      address_en: "Choithram Market, Indore", address_hi: "छोइथराम मार्केट, इंदौर",
      crops: ["wheat", "mustard", "bajra"], capacity: 7, open: "8:30 AM – 5:30 PM", distanceKm: 6
    }
  ];

  return {
    version: 1,
    settings: { lang: "hi", theme: "light" },
    session: { farmerId: null },
    farmers: [],
    centres: centres,
    bookings: [],
    grievances: [],
    notifications: [],
    counters: {} // per-centre-per-date token counters
  };
}

function loadDB() {
  var raw = null;
  try { raw = localStorage.getItem(DB_KEY); } catch (e) { raw = null; }
  if (!raw) {
    var fresh = _seed();
    saveDB(fresh);
    return fresh;
  }
  try {
    var db = JSON.parse(raw);
    if (!db.centres) db.centres = _seed().centres;
    return db;
  } catch (e) {
    var f = _seed();
    saveDB(f);
    return f;
  }
}

function saveDB(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {}
}

/* ---- Helpers ---- */
function uid(prefix) {
  return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getCentre(db, id) {
  for (var i = 0; i < db.centres.length; i++) if (db.centres[i].id === id) return db.centres[i];
  return null;
}

function getFarmer(db, id) {
  for (var i = 0; i < db.farmers.length; i++) if (db.farmers[i].id === id) return db.farmers[i];
  return null;
}

function findFarmerByPhone(db, phone) {
  for (var i = 0; i < db.farmers.length; i++) if (db.farmers[i].phone === phone) return db.farmers[i];
  return null;
}

/* Time slot templates */
var SLOT_TIMES = ["9:00 – 10:30", "10:30 – 12:00", "12:00 – 1:30", "2:00 – 3:30", "3:30 – 5:00"];

/* Count active bookings in a centre+date+slot (booked or serving) */
function slotUsed(db, centreId, date, slot) {
  var n = 0;
  for (var i = 0; i < db.bookings.length; i++) {
    var b = db.bookings[i];
    if (b.centreId === centreId && b.date === date && b.slot === slot &&
        (b.status === "booked" || b.status === "serving")) n++;
  }
  return n;
}

/* Next token number for a centre on a date */
function nextToken(db, centreId, date) {
  var key = centreId + "|" + date;
  db.counters[key] = (db.counters[key] || 0) + 1;
  return db.counters[key];
}

/* Active booking for a farmer (not procured/paid/cancelled) */
function activeBooking(db, farmerId) {
  var list = db.bookings.filter(function (b) {
    return b.farmerId === farmerId && (b.status === "booked" || b.status === "serving");
  });
  list.sort(function (a, b) { return b.createdAt - a.createdAt; });
  return list[0] || null;
}

/* Queue for a centre on a date, ordered by token number */
function centreQueue(db, centreId, date) {
  return db.bookings
    .filter(function (b) { return b.centreId === centreId && b.date === date && b.status !== "cancelled"; })
    .sort(function (a, b) { return a.token - b.token; });
}

/* How many people are ahead of this booking (still booked/serving with lower token) */
function peopleAhead(db, booking) {
  var n = 0;
  var q = centreQueue(db, booking.centreId, booking.date);
  for (var i = 0; i < q.length; i++) {
    var b = q[i];
    if (b.token < booking.token && (b.status === "booked" || b.status === "serving")) n++;
  }
  return n;
}

function addNotification(db, farmerId, key, extra) {
  db.notifications.unshift({
    id: uid("n"), farmerId: farmerId, key: key, extra: extra || {},
    time: Date.now(), read: false
  });
}

function unreadCount(db, farmerId) {
  return db.notifications.filter(function (n) { return n.farmerId === farmerId && !n.read; }).length;
}

function estAmount(booking) {
  var price = CROP_PRICE[booking.crop] || 2000;
  return Math.round(price * (Number(booking.qty) || 0));
}

/* ===== Kisan Kalyan - app logic (router + views) ===== */
var app = document.getElementById("app");
var bottomnav = document.getElementById("bottomnav");
var notifBtn = document.getElementById("notifBtn");
var notifDot = document.getElementById("notifDot");

/* temporary UI state that does not need saving */
var UI = { phone: "", booking: { centreId: "", date: _todayISO(0), slot: "", crop: "", qty: "" }, deskCentre: "" };

/* -------------------------------------------------- boot -------------------------------------------------- */
function boot() {
  var db = loadDB();
  LANG = (db.settings && db.settings.lang) || "hi";
  applyLang();
  applyTheme((db.settings && db.settings.theme) || "light");
  wireChrome();
  if (!location.hash) location.hash = "#/login";
  render();
  window.addEventListener("hashchange", render);
}

function wireChrome() {
  document.getElementById("langToggle").addEventListener("click", function () {
    var db = loadDB();
    LANG = LANG === "hi" ? "en" : "hi";
    db.settings.lang = LANG; saveDB(db);
    applyLang(); render();
  });
  document.getElementById("themeToggle").addEventListener("click", function () {
    var db = loadDB();
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    db.settings.theme = next; saveDB(db);
    applyTheme(next);
  });
  notifBtn.addEventListener("click", function () { location.hash = "#/notifications"; });
}

function applyLang() {
  document.documentElement.setAttribute("lang", LANG === "hi" ? "hi" : "en");
  document.getElementById("langLabel").textContent = LANG === "hi" ? "EN" : "हिं";
  // translate static [data-i18n] nodes (nav, tagline)
  var nodes = document.querySelectorAll("[data-i18n]");
  nodes.forEach(function (n) { n.textContent = t(n.getAttribute("data-i18n")); });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#0d1611" : "#16a34a");
}

/* -------------------------------------------------- router -------------------------------------------------- */
var ROUTES = {
  "/login": viewLogin, "/register": viewRegister, "/home": viewHome,
  "/centres": viewCentres, "/book": viewBook, "/token": viewToken,
  "/status": viewStatus, "/history": viewHistory, "/notifications": viewNotifications,
  "/help": viewHelp, "/desk": viewDesk
};

function currentRoute() {
  var h = location.hash.replace(/^#/, "") || "/login";
  var parts = h.split("?");
  return { path: parts[0], query: parseQuery(parts[1]) };
}
function parseQuery(q) {
  var o = {}; if (!q) return o;
  q.split("&").forEach(function (p) { var kv = p.split("="); o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); });
  return o;
}

function render() {
  var db = loadDB();
  var r = currentRoute();
  var fn = ROUTES[r.path];

  // auth guard: farmer routes need a logged-in farmer
  var farmerRoutes = ["/home", "/centres", "/book", "/token", "/status", "/history", "/notifications", "/help"];
  if (farmerRoutes.indexOf(r.path) !== -1 && !db.session.farmerId) { location.hash = "#/login"; return; }
  if (!fn) { location.hash = "#/login"; return; }

  window.scrollTo(0, 0);
  app.innerHTML = "";
  fn(db, r.query);

  // chrome visibility
  var showFarmerChrome = farmerRoutes.indexOf(r.path) !== -1;
  bottomnav.hidden = !showFarmerChrome;
  notifBtn.hidden = !showFarmerChrome;
  document.getElementById("brandLink").setAttribute("href", db.session.farmerId ? "#/home" : "#/login");

  if (showFarmerChrome) {
    notifDot.hidden = unreadCount(db, db.session.farmerId) === 0;
    document.querySelectorAll(".bottomnav a").forEach(function (a) {
      var nav = a.getAttribute("data-nav");
      var active = ("/" + nav) === r.path;
      a.classList.toggle("active", active);
    });
  }
  applyLang();
}

/* -------------------------------------------------- helpers -------------------------------------------------- */
function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
  return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

function cropName(key) { return t("crop_" + key); }

function centreName(c) { return LANG === "hi" ? c.name_hi : c.name_en; }
function centreDist(c) { return LANG === "hi" ? c.district_hi : c.district_en; }
function centreAddr(c) { return LANG === "hi" ? c.address_hi : c.address_en; }

function toast(msg, kind) {
  var wrap = document.getElementById("toastWrap");
  var tEl = el('<div class="toast ' + (kind || "") + '">' + esc(msg) + "</div>");
  wrap.appendChild(tEl);
  setTimeout(function () { tEl.style.opacity = "0"; tEl.style.transition = "opacity .3s"; setTimeout(function () { tEl.remove(); }, 300); }, 2600);
}

function fmtDate(iso) {
  var d = new Date(iso + "T00:00:00");
  var opt = { weekday: "short", day: "numeric", month: "short" };
  try { return d.toLocaleDateString(LANG === "hi" ? "hi-IN" : "en-IN", opt); } catch (e) { return iso; }
}
function relTime(ms) {
  var diff = Math.round((Date.now() - ms) / 60000);
  if (diff < 1) return LANG === "hi" ? "अभी" : "just now";
  if (diff < 60) return diff + (LANG === "hi" ? " मिनट पहले" : "m ago");
  var h = Math.round(diff / 60);
  if (h < 24) return h + (LANG === "hi" ? " घंटे पहले" : "h ago");
  return Math.round(h / 24) + (LANG === "hi" ? " दिन पहले" : "d ago");
}

function statusBadge(status) {
  var map = {
    booked: ["info", "st_booked"], serving: ["warn", "st_serving"],
    procured: ["ok", "st_procured"], paid: ["pay", "st_paid"], cancelled: ["muted", "booking_cancelled"]
  };
  var m = map[status] || ["muted", status];
  return '<span class="badge ' + m[0] + '">' + esc(t(m[1])) + "</span>";
}

/* ============================================================ VIEWS ============================================================ */

/* ---------- Login ---------- */
function viewLogin(db) {
  var v = el('<section class="view auth-wrap"></section>');
  v.appendChild(el(
    '<div class="hero">' +
      '<img src="public/images/hero-farm.png" alt="Farmers at a procurement centre" />' +
      '<div class="hero-cap"><h1>Kisan Kalyan</h1><p>' + esc(t("login_sub")) + "</p></div>" +
    "</div>"));

  var card = el('<div class="card"></div>');
  card.appendChild(el('<div class="page-head" style="margin-top:0"><h1>' + esc(t("login_title")) + "</h1></div>"));

  var field = el(
    '<div class="field"><label for="phone">' + esc(t("phone_label")) + "</label>" +
    '<input id="phone" type="tel" inputmode="numeric" maxlength="10" placeholder="' + esc(t("phone_ph")) + '" value="' + esc(UI.phone) + '" /></div>');
  card.appendChild(field);

  var btn = el('<button class="btn btn-primary" id="sendOtp">' + esc(t("send_otp")) + "</button>");
  card.appendChild(btn);
  card.appendChild(el('<div class="demo-note">' +
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>' +
    "<span>" + esc(t("demo_otp_note")) + " <b>" + OTP_DEMO + "</b></span></div>"));

  btn.addEventListener("click", function () {
    var phone = card.querySelector("#phone").value.replace(/\D/g, "");
    if (phone.length !== 10) { toast(t("invalid_phone"), "warn"); return; }
    UI.phone = phone;
    location.hash = "#/login?step=otp";
  });

  v.appendChild(card);
  app.appendChild(v);

  // OTP step
  if (currentRoute().query.step === "otp") renderOtpStep(db);
}

function renderOtpStep(db) {
  var v = document.querySelector(".auth-wrap");
  v.innerHTML = "";
  var card = el('<div class="card"></div>');
  card.appendChild(el('<button class="back-link" id="backPhone">‹ ' + esc(t("change_number")) + "</button>"));
  card.appendChild(el('<div class="page-head" style="margin-top:0"><h1>' + esc(t("otp_title")) + '</h1><p>' + esc(t("otp_sub")) + " +91 " + esc(UI.phone) + "</p></div>"));

  var otpWrap = el('<div class="field"><div class="otp-inputs"></div></div>');
  var box = otpWrap.querySelector(".otp-inputs");
  for (var i = 0; i < 4; i++) {
    box.appendChild(el('<input type="tel" inputmode="numeric" maxlength="1" aria-label="OTP digit ' + (i + 1) + '" />'));
  }
  card.appendChild(otpWrap);
  var inputs = box.querySelectorAll("input");
  inputs.forEach(function (inp, idx) {
    inp.addEventListener("input", function () {
      inp.value = inp.value.replace(/\D/g, "");
      if (inp.value && idx < 3) inputs[idx + 1].focus();
    });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Backspace" && !inp.value && idx > 0) inputs[idx - 1].focus();
    });
  });

  var btn = el('<button class="btn btn-primary" id="verify">' + esc(t("verify_otp")) + "</button>");
  card.appendChild(btn);
  card.appendChild(el('<div class="demo-note">' +
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>' +
    "<span>" + esc(t("demo_otp_note")) + " <b>" + OTP_DEMO + "</b></span></div>"));

  card.querySelector("#backPhone").addEventListener("click", function () { location.hash = "#/login"; });
  btn.addEventListener("click", function () {
    var code = ""; inputs.forEach(function (i) { code += i.value; });
    if (code !== OTP_DEMO) { toast(t("invalid_otp"), "warn"); return; }
    var db2 = loadDB();
    var farmer = findFarmerByPhone(db2, UI.phone);
    if (farmer) {
      db2.session.farmerId = farmer.id; saveDB(db2);
      location.hash = "#/home";
    } else {
      location.hash = "#/register";
    }
  });
  v.appendChild(card);
  inputs[0].focus();
}

/* ---------- Register / profile ---------- */
function viewRegister(db) {
  var editing = !!db.session.farmerId;
  var f = editing ? getFarmer(db, db.session.farmerId) : { name: "", village: "", district: "", crop: "wheat", land: "", phone: UI.phone };

  var v = el('<section class="view auth-wrap"></section>');
  var card = el('<div class="card"></div>');
  card.appendChild(el('<div class="page-head" style="margin-top:0"><h1>' + esc(t("reg_title")) + '</h1><p>' + esc(t("reg_sub")) + "</p></div>"));

  card.appendChild(el('<div class="field"><label>' + esc(t("name_label")) + '</label><input id="r_name" value="' + esc(f.name) + '" placeholder="' + esc(t("name_ph")) + '" /></div>'));
  card.appendChild(el('<div class="grid grid-2">' +
    '<div class="field"><label>' + esc(t("village_label")) + '</label><input id="r_village" value="' + esc(f.village) + '" placeholder="' + esc(t("village_ph")) + '" /></div>' +
    '<div class="field"><label>' + esc(t("district_label")) + '</label><input id="r_district" value="' + esc(f.district) + '" placeholder="' + esc(t("district_ph")) + '" /></div>' +
  "</div>"));
  card.appendChild(el('<div class="grid grid-2">' +
    '<div class="field"><label>' + esc(t("crop_label")) + '</label><select id="r_crop">' + cropOptions(f.crop) + "</select></div>" +
    '<div class="field"><label>' + esc(t("landsize_label")) + '</label><input id="r_land" type="number" min="0" value="' + esc(f.land) + '" placeholder="' + esc(t("landsize_ph")) + '" /></div>' +
  "</div>"));

  var btn = el('<button class="btn btn-primary">' + esc(t("save_profile")) + "</button>");
  card.appendChild(btn);
  btn.addEventListener("click", function () {
    var name = card.querySelector("#r_name").value.trim();
    if (!name) { toast(t("name_label"), "warn"); card.querySelector("#r_name").focus(); return; }
    var db2 = loadDB();
    if (editing) {
      var ff = getFarmer(db2, db2.session.farmerId);
      ff.name = name; ff.village = card.querySelector("#r_village").value.trim();
      ff.district = card.querySelector("#r_district").value.trim();
      ff.crop = card.querySelector("#r_crop").value; ff.land = card.querySelector("#r_land").value;
    } else {
      var nf = {
        id: uid("f"), phone: UI.phone, name: name,
        village: card.querySelector("#r_village").value.trim(),
        district: card.querySelector("#r_district").value.trim(),
        crop: card.querySelector("#r_crop").value, land: card.querySelector("#r_land").value,
        createdAt: Date.now()
      };
      db2.farmers.push(nf);
      db2.session.farmerId = nf.id;
    }
    saveDB(db2);
    toast(t("profile_saved"), "ok");
    location.hash = "#/home";
  });

  v.appendChild(card);
  app.appendChild(v);
}

function cropOptions(sel) {
  return ["wheat", "rice", "maize", "bajra", "mustard"].map(function (c) {
    return '<option value="' + c + '"' + (c === sel ? " selected" : "") + ">" + esc(cropName(c)) + "</option>";
  }).join("");
}

/* ---------- Home ---------- */
function viewHome(db) {
  var farmer = getFarmer(db, db.session.farmerId);
  var v = el('<section class="view"></section>');

  var w = el('<div class="welcome"><h1>' + esc(t("hello")) + ", " + esc(farmer.name.split(" ")[0]) + "!</h1><p>" + esc(t("home_sub")) + "</p></div>");
  v.appendChild(w);

  // active booking summary
  var ab = activeBooking(db, farmer.id);
  var abCard = el('<div class="card" style="margin-top:14px"></div>');
  abCard.appendChild(el('<div class="section-title" style="margin-top:0"><h2>' + esc(t("active_booking")) + "</h2></div>"));
  if (ab) {
    var c = getCentre(db, ab.centreId);
    var ahead = peopleAhead(db, ab);
    abCard.appendChild(el(
      '<div class="list-item" data-go="#/token">' +
        '<div class="avatar"><b style="font-size:1.1rem">#' + ab.token + "</b></div>" +
        '<div class="li-main"><strong>' + esc(centreName(c)) + "</strong>" +
          "<small>" + esc(fmtDate(ab.date)) + " · " + esc(ab.slot) + " · " + statusText(ab.status) + "</small></div>" +
        '<div class="chev">›</div>' +
      "</div>"));
    abCard.appendChild(el('<p class="hint" style="margin-top:10px">' + (ab.status === "serving" ? esc(t("being_served")) : (ahead + " " + esc(t("people_ahead")))) + "</p>"));
  } else {
    abCard.appendChild(el('<p class="hint" style="margin:0">' + esc(t("no_active")) + "</p>"));
    abCard.appendChild(el('<div style="margin-top:12px"><a class="btn btn-primary" href="#/book">' + esc(t("book_now")) + "</a></div>"));
  }
  v.appendChild(abCard);

  // tiles
  var tiles = el('<div class="tiles"></div>');
  tiles.appendChild(tile("#/book", "book", t("tile_book"), t("tile_book_sub"), iconSlot(), false));
  tiles.appendChild(tile("#/token", "token", t("tile_token"), t("tile_token_sub"), iconTicket(), true));
  tiles.appendChild(tile("#/status", "status", t("tile_status"), t("tile_status_sub"), iconTrack(), false));
  tiles.appendChild(tile("#/centres", "centres", t("tile_centres"), t("tile_centres_sub"), iconPin(), true));
  tiles.appendChild(tile("#/history", "history", t("tile_history"), t("tile_history_sub"), iconHistory(), false));
  tiles.appendChild(tile("#/help", "help", t("tile_help"), t("tile_help_sub"), iconHelp(), true));
  v.appendChild(tiles);

  // role + logout
  var role = el('<div class="rolebar"></div>');
  var deskBtn = el('<a class="btn btn-outline" href="#/desk">' + esc(t("switch_to_desk")) + "</a>");
  var outBtn = el('<button class="btn btn-ghost">' + esc(t("logout")) + "</button>");
  outBtn.addEventListener("click", function () {
    var db2 = loadDB(); db2.session.farmerId = null; saveDB(db2); location.hash = "#/login";
  });
  role.appendChild(deskBtn); role.appendChild(outBtn);
  v.appendChild(role);

  v.querySelectorAll("[data-go]").forEach(function (n) {
    n.addEventListener("click", function () { location.hash = n.getAttribute("data-go"); });
  });

  app.appendChild(v);
}

function statusText(status) {
  var map = { booked: "st_booked", serving: "st_serving", procured: "st_procured", paid: "st_paid", cancelled: "booking_cancelled" };
  return esc(t(map[status] || status));
}

function tile(href, nav, title, sub, icon, amber) {
  return el('<a class="tile" href="' + href + '">' +
    '<span class="ic ' + (amber ? "amber" : "") + '">' + icon + "</span>" +
    "<strong>" + esc(title) + "</strong><span class=\"sub\">" + esc(sub) + "</span></a>");
}

/* ---------- Centres ---------- */
function viewCentres(db, q) {
  var v = el('<section class="view"></section>');
  v.appendChild(el('<div class="page-head"><h1>' + esc(t("centres_title")) + '</h1><p>' + esc(t("centres_sub")) + "</p></div>"));
  var pick = q.pick === "1";

  var grid = el('<div class="grid"></div>');
  db.centres.forEach(function (c) {
    var card = el('<div class="card"></div>');
    card.appendChild(el(
      '<div style="display:flex;gap:12px;align-items:flex-start">' +
        '<div class="avatar" style="width:46px;height:46px;border-radius:12px;display:grid;place-items:center">' + iconPin() + "</div>" +
        '<div style="flex:1;min-width:0">' +
          '<strong style="font-size:1.02rem">' + esc(centreName(c)) + "</strong>" +
          '<div style="color:var(--muted);font-size:.85rem">' + esc(centreDist(c)) + "</div>" +
          '<div style="color:var(--muted);font-size:.82rem;margin-top:2px">' + esc(centreAddr(c)) + "</div>" +
        "</div>" +
        '<span class="badge ok">' + esc(t("open_now")) + "</span>" +
      "</div>"));

    card.appendChild(el('<hr class="divider" />'));
    card.appendChild(el(
      '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:.84rem;color:var(--muted)">' +
        "<span>⏱ " + esc(c.open) + "</span>" +
        "<span>👥 " + c.capacity + " " + esc(t("per_slot")) + "</span>" +
        "<span>📍 ~" + c.distanceKm + " km</span>" +
      "</div>"));

    var chips = '<div style="margin-top:10px"><div style="font-size:.78rem;color:var(--muted);margin-bottom:6px">' + esc(t("crops_bought")) + "</div><div class=\"chips\">";
    c.crops.forEach(function (cr) { chips += '<span class="chip">' + esc(cropName(cr)) + "</span>"; });
    chips += "</div></div>";
    card.appendChild(el(chips));

    var b = el('<button class="btn btn-primary btn-sm" style="margin-top:14px;width:100%">' + esc(t("select_centre")) + "</button>");
    b.addEventListener("click", function () {
      UI.booking.centreId = c.id;
      location.hash = "#/book";
    });
    card.appendChild(b);
    grid.appendChild(card);
  });
  v.appendChild(grid);
  app.appendChild(v);
}

/* ---------- Book ---------- */
function viewBook(db) {
  var farmer = getFarmer(db, db.session.farmerId);
  var existing = activeBooking(db, farmer.id);

  var v = el('<section class="view"></section>');
  v.appendChild(el('<button class="back-link" onclick="history.back()">‹ ' + esc(t("back")) + "</button>"));
  v.appendChild(el('<div class="page-head" style="margin-top:0"><h1>' + esc(t("book_title")) + '</h1><p>' + esc(t("book_sub")) + "</p></div>"));

  if (existing) {
    var c0 = getCentre(db, existing.centreId);
    var warn = el('<div class="card"><p style="margin:0 0 12px">' + esc(t("already_booked")) + "</p></div>");
    warn.appendChild(el('<a class="btn btn-primary" href="#/token">' + esc(t("token_title")) + "</a>"));
    v.appendChild(warn);
    app.appendChild(v);
    return;
  }

  if (!UI.booking.centreId) UI.booking.centreId = db.centres[0].id;
  if (!UI.booking.crop) UI.booking.crop = farmer.crop || "wheat";

  var card = el('<div class="card"></div>');

  // centre select
  var csel = '<div class="field"><label>' + esc(t("step_centre")) + "</label><select id=\"b_centre\">";
  db.centres.forEach(function (c) { csel += '<option value="' + c.id + '"' + (c.id === UI.booking.centreId ? " selected" : "") + ">" + esc(centreName(c)) + "</option>"; });
  csel += "</select></div>";
  card.appendChild(el(csel));

  // date select
  card.appendChild(el('<div class="field"><label>' + esc(t("date_label")) + '</label>' +
    '<div class="btn-row" id="dateRow">' +
      '<button class="btn ' + (UI.booking.date === _todayISO(0) ? "btn-primary" : "btn-outline") + '" data-date="' + _todayISO(0) + '">' + esc(t("today")) + " · " + esc(fmtDate(_todayISO(0))) + "</button>" +
      '<button class="btn ' + (UI.booking.date === _todayISO(1) ? "btn-primary" : "btn-outline") + '" data-date="' + _todayISO(1) + '">' + esc(t("tomorrow")) + " · " + esc(fmtDate(_todayISO(1))) + "</button>" +
    "</div></div>"));

  // slots
  card.appendChild(el('<div class="field"><label>' + esc(t("step_slot")) + '</label><div class="slot-grid" id="slotGrid"></div></div>'));

  // crop + qty
  card.appendChild(el('<div class="grid grid-2">' +
    '<div class="field"><label>' + esc(t("crop_type")) + '</label><select id="b_crop">' + cropOptions(UI.booking.crop) + "</select></div>" +
    '<div class="field"><label>' + esc(t("quantity_label")) + '</label><input id="b_qty" type="number" min="1" value="' + esc(UI.booking.qty) + '" placeholder="' + esc(t("quantity_ph")) + '" /></div>' +
  "</div>"));

  var confirm = el('<button class="btn btn-primary" id="confirmBook">' + esc(t("confirm_booking")) + "</button>");
  card.appendChild(confirm);
  v.appendChild(card);
  app.appendChild(v);

  function renderSlots() {
    var grid = card.querySelector("#slotGrid");
    var centre = getCentre(db, UI.booking.centreId);
    grid.innerHTML = "";
    SLOT_TIMES.forEach(function (s) {
      var used = slotUsed(loadDB(), centre.id, UI.booking.date, s);
      var left = centre.capacity - used;
      var pct = Math.min(100, Math.round((used / centre.capacity) * 100));
      var full = left <= 0;
      var cls = "slot" + (full ? " full" : "") + (UI.booking.slot === s && !full ? " selected" : "");
      var barCls = pct >= 100 ? "fullc" : (pct >= 70 ? "high" : "");
      var node = el('<button type="button" class="' + cls + '">' +
        '<div class="time">' + s + "</div>" +
        '<div class="cap">' + (full ? esc(t("slot_full")) : (left + " " + esc(t("slots_left")))) + "</div>" +
        '<div class="capbar"><i class="' + barCls + '" style="width:' + pct + '%"></i></div>' +
      "</button>");
      if (!full) node.addEventListener("click", function () { UI.booking.slot = s; renderSlots(); });
      grid.appendChild(node);
    });
  }
  renderSlots();

  card.querySelector("#b_centre").addEventListener("change", function (e) { UI.booking.centreId = e.target.value; UI.booking.slot = ""; renderSlots(); });
  card.querySelector("#dateRow").querySelectorAll("[data-date]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      UI.booking.date = btn.getAttribute("data-date"); UI.booking.slot = "";
      card.querySelector("#dateRow").querySelectorAll("button").forEach(function (b) { b.className = "btn btn-outline"; });
      btn.className = "btn btn-primary";
      renderSlots();
    });
  });
  card.querySelector("#b_crop").addEventListener("change", function (e) { UI.booking.crop = e.target.value; });
  card.querySelector("#b_qty").addEventListener("input", function (e) { UI.booking.qty = e.target.value; });

  confirm.addEventListener("click", function () {
    if (!UI.booking.slot) { toast(t("select_slot_first"), "warn"); return; }
    var qty = Number(card.querySelector("#b_qty").value);
    if (!qty || qty <= 0) { toast(t("fill_crop"), "warn"); return; }
    var db2 = loadDB();
    var token = nextToken(db2, UI.booking.centreId, UI.booking.date);
    var booking = {
      id: uid("b"), farmerId: farmer.id, centreId: UI.booking.centreId,
      date: UI.booking.date, slot: UI.booking.slot, crop: card.querySelector("#b_crop").value,
      qty: qty, token: token, status: "booked", createdAt: Date.now(),
      procuredAt: null, paidAt: null
    };
    db2.bookings.push(booking);
    addNotification(db2, farmer.id, "notif_booked", { token: token });
    saveDB(db2);
    UI.booking.slot = ""; UI.booking.qty = "";
    toast(t("booking_done"), "ok");
    location.hash = "#/token";
  });
}

/* ---------- Token ---------- */
function viewToken(db) {
  var farmer = getFarmer(db, db.session.farmerId);
  var b = activeBooking(db, farmer.id);
  var v = el('<section class="view"></section>');
  v.appendChild(el('<div class="page-head"><h1>' + esc(t("token_title")) + '</h1><p>' + esc(t("token_sub")) + "</p></div>"));

  if (!b) {
    v.appendChild(emptyState(iconTicket(), t("no_token"), t("book_now"), "#/book"));
    app.appendChild(v);
    return;
  }

  var c = getCentre(db, b.id ? b.centreId : "");
  var ahead = peopleAhead(db, b);
  var eta = ahead * AVG_SERVICE_MIN;

  v.appendChild(el(
    '<div class="ticket">' +
      '<div class="tk-label">' + esc(t("token_word")) + "</div>" +
      '<div class="tk-num">#' + b.token + "</div>" +
      "<div>" + statusBadge(b.status) + "</div>" +
      '<div class="tk-meta">' +
        "<div><b>" + esc(t("at_centre")) + "</b>" + esc(centreName(c)) + "</div>" +
        "<div><b>" + esc(t("on_date")) + "</b>" + esc(fmtDate(b.date)) + "</div>" +
        "<div><b>" + esc(t("time_slot")) + "</b>" + esc(b.slot) + "</div>" +
        "<div><b>" + esc(t("crop_word")) + "</b>" + esc(cropName(b.crop)) + "</div>" +
        "<div><b>" + esc(t("qty_word")) + "</b>" + esc(b.qty) + " " + esc(t("quintal")) + "</div>" +
      "</div>" +
    "</div>"));

  // live queue card
  var qcard = el('<div class="card" style="margin-top:14px"></div>');
  qcard.appendChild(el('<div class="section-title" style="margin-top:0"><h2>' + esc(t("live_queue")) + '</h2><button class="link-btn" id="refreshBtn">' + esc(t("refresh")) + "</button></div>"));

  if (b.status === "serving") {
    qcard.appendChild(el('<div class="eta-card"><div class="badge warn" style="font-size:.9rem;padding:8px 14px">' + esc(t("being_served")) + "</div></div>"));
  } else if (ahead === 0) {
    qcard.appendChild(el('<div class="eta-card"><div class="badge ok" style="font-size:.9rem;padding:8px 14px">' + esc(t("your_turn")) + "</div></div>"));
  } else {
    qcard.appendChild(el('<div class="eta-card">' +
      '<div class="eta-num">' + eta + ' <span style="font-size:1rem">' + esc(t("minutes")) + "</span></div>" +
      '<div class="eta-sub">' + esc(t("est_wait")) + " · " + ahead + " " + esc(t("people_ahead")) + "</div>" +
    "</div>"));
  }

  // queue strip
  var q = centreQueue(db, b.centreId, b.date);
  var strip = el('<div class="queue-strip"></div>');
  q.forEach(function (item) {
    var cls = "qdot";
    if (item.id === b.id) cls += " me";
    else if (item.status === "serving") cls += " serving";
    else if (item.status === "procured" || item.status === "paid") cls += " done";
    strip.appendChild(el('<span class="' + cls + '">#' + item.token + "</span>"));
  });
  qcard.appendChild(strip);
  v.appendChild(qcard);

  // actions
  var actions = el('<div class="btn-row" style="margin-top:14px"></div>');
  var statusBtn = el('<a class="btn btn-outline" href="#/status">' + esc(t("tile_status")) + "</a>");
  var cancelBtn = el('<button class="btn btn-ghost">' + esc(t("cancel_booking")) + "</button>");
  cancelBtn.addEventListener("click", function () {
    var db2 = loadDB();
    var bb = db2.bookings.filter(function (x) { return x.id === b.id; })[0];
    if (bb) { bb.status = "cancelled"; saveDB(db2); }
    toast(t("booking_cancelled"), "warn");
    render();
  });
  actions.appendChild(statusBtn); actions.appendChild(cancelBtn);
  v.appendChild(actions);

  app.appendChild(v);
  qcard.querySelector("#refreshBtn").addEventListener("click", function () { render(); toast(t("refresh"), "ok"); });
}

/* ---------- Status tracking ---------- */
function viewStatus(db) {
  var farmer = getFarmer(db, db.session.farmerId);
  var bookings = db.bookings.filter(function (b) { return b.farmerId === farmer.id && b.status !== "cancelled"; })
    .sort(function (a, b) { return b.createdAt - a.createdAt; });
  var b = bookings[0];

  var v = el('<section class="view"></section>');
  v.appendChild(el('<div class="page-head"><h1>' + esc(t("status_title")) + '</h1><p>' + esc(t("status_sub")) + "</p></div>"));

  if (!b) { v.appendChild(emptyState(iconTrack(), t("no_active"), t("book_now"), "#/book")); app.appendChild(v); return; }

  var c = getCentre(db, b.centreId);
  var order = ["booked", "serving", "procured", "paid"];
  var stepIndex = { booked: 0, serving: 1, procured: 2, paid: 3 };
  var cur = stepIndex[b.status];

  var steps = [
    ["st_booked", "st_booked_d", iconCheck()],
    ["st_serving", "st_serving_d", iconWeigh()],
    ["st_procured", "st_procured_d", iconBox()],
    ["st_paid", "st_paid_d", iconRupee()]
  ];

  // procurement card (steps 0-2) + payment step (3)
  var pcard = el('<div class="card"></div>');
  pcard.appendChild(el('<div class="section-title" style="margin-top:0"><h2>' + esc(t("proc_status")) + '</h2>' + statusBadge(b.status) + "</div>"));
  var ol = el('<ul class="steps"></ul>');
  for (var i = 0; i < 3; i++) {
    var stcls = i < cur ? "done" : (i === cur ? "active" : "");
    if (cur >= 2 && i <= 2) stcls = i < 2 ? "done" : (i === 2 ? (cur === 2 ? "done" : "done") : stcls);
    // simpler: done if i<=cur when cur reached that stage
    stcls = (i < cur) ? "done" : (i === cur ? "active" : "");
    if (b.status === "procured" && i <= 2) stcls = "done";
    if (b.status === "paid" && i <= 2) stcls = "done";
    ol.appendChild(el('<li class="' + stcls + '"><span class="dot">' + steps[i][2] + '</span>' +
      '<div class="st-main"><strong>' + esc(t(steps[i][0])) + '</strong><small>' + esc(t(steps[i][1])) + "</small></div></li>"));
  }
  pcard.appendChild(ol);
  pcard.appendChild(el('<hr class="divider" />'));
  pcard.appendChild(el('<div class="kv"><span>' + esc(t("at_centre")) + '</span><b>' + esc(centreName(c)) + "</b></div>"));
  pcard.appendChild(el('<div class="kv"><span>' + esc(t("crop_word")) + " · " + esc(t("qty_word")) + '</span><b>' + esc(cropName(b.crop)) + " · " + esc(b.qty) + " " + esc(t("quintal")) + "</b></div>"));
  v.appendChild(pcard);

  // payment card
  var payDone = b.status === "paid";
  var payPending = b.status === "procured";
  var pay = el('<div class="card" style="margin-top:12px"></div>');
  pay.appendChild(el('<div class="section-title" style="margin-top:0"><h2>' + esc(t("pay_status")) + '</h2>' +
    (payDone ? '<span class="badge pay">' + esc(t("st_paid")) + "</span>" : '<span class="badge warn">' + esc(t("st_pay_pending")) + "</span>") + "</div>"));
  pay.appendChild(el('<div class="kv"><span>' + esc(payDone ? t("amount") : t("est_amount")) + '</span><b>₹ ' + estAmount(b).toLocaleString("en-IN") + "</b></div>"));
  pay.appendChild(el('<div class="kv"><span>' + esc(t("pay_status")) + '</span><b>' +
    (payDone ? esc(t("st_paid_d")) : (payPending ? esc(t("st_pay_pending_d")) : esc(t("st_queue_d")))) + "</b></div>"));
  v.appendChild(pay);

  app.appendChild(v);
}

/* ---------- History ---------- */
function viewHistory(db) {
  var farmer = getFarmer(db, db.session.farmerId);
  var bookings = db.bookings.filter(function (b) { return b.farmerId === farmer.id; })
    .sort(function (a, b) { return b.createdAt - a.createdAt; });

  var v = el('<section class="view"></section>');
  v.appendChild(el('<div class="page-head"><h1>' + esc(t("history_title")) + '</h1><p>' + esc(t("history_sub")) + "</p></div>"));

  if (!bookings.length) { v.appendChild(emptyState(iconHistory(), t("no_history"), t("book_now"), "#/book")); app.appendChild(v); return; }

  var grid = el('<div class="grid"></div>');
  bookings.forEach(function (b) {
    var c = getCentre(db, b.centreId);
    var card = el('<div class="card"></div>');
    card.appendChild(el('<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
      '<div><strong>#' + b.token + " · " + esc(centreName(c)) + "</strong>" +
      '<div style="color:var(--muted);font-size:.84rem">' + esc(fmtDate(b.date)) + " · " + esc(b.slot) + "</div></div>" +
      statusBadge(b.status) + "</div>"));
    card.appendChild(el('<hr class="divider" />'));
    card.appendChild(el('<div class="kv"><span>' + esc(t("crop_word")) + '</span><b>' + esc(cropName(b.crop)) + " · " + esc(b.qty) + " " + esc(t("quintal")) + "</b></div>"));
    card.appendChild(el('<div class="kv"><span>' + esc(b.status === "paid" ? t("amount") : t("est_amount")) + '</span><b>₹ ' + estAmount(b).toLocaleString("en-IN") + "</b></div>"));
    grid.appendChild(card);
  });
  v.appendChild(grid);
  app.appendChild(v);
}

/* ---------- Notifications ---------- */
function notifText(n) {
  var token = n.extra && n.extra.token;
  var m = {
    notif_booked: { en: "Slot booked. Your token is #" + token + ".", hi: "स्लॉट बुक हो गया। आपका टोकन #" + token + " है।" },
    notif_called: { en: "It's your turn! Token #" + token + " — please go to the counter.", hi: "आपकी बारी है! टोकन #" + token + " — कृपया काउंटर पर जाएँ।" },
    notif_procured: { en: "Your crop (token #" + token + ") has been procured.", hi: "आपकी फसल (टोकन #" + token + ") खरीद ली गई है।" },
    notif_paid: { en: "Payment done for token #" + token + ". Amount credited.", hi: "टोकन #" + token + " का भुगतान हो गया। राशि जमा।" }
  };
  var e = m[n.key];
  return e ? e[LANG === "hi" ? "hi" : "en"] : n.key;
}

function viewNotifications(db) {
  var farmer = getFarmer(db, db.session.farmerId);
  var list = db.notifications.filter(function (n) { return n.farmerId === farmer.id; });

  var v = el('<section class="view"></section>');
  var head = el('<div class="section-title" style="margin-top:4px"><div><h1 style="margin:0;font-size:1.35rem">' + esc(t("notif_title")) + '</h1><p style="margin:0;color:var(--muted);font-size:.9rem">' + esc(t("notif_sub")) + "</p></div></div>");
  if (list.length) head.appendChild(el('<button class="link-btn" id="markRead">' + esc(t("mark_read")) + "</button>"));
  v.appendChild(head);

  if (!list.length) { v.appendChild(emptyState(iconBell(), t("no_notif"))); app.appendChild(v); return; }

  var card = el('<div class="card"></div>');
  list.forEach(function (n) {
    card.appendChild(el('<div class="notif-item ' + (n.read ? "" : "unread") + '">' +
      '<div class="nic">' + iconBell() + "</div>" +
      '<div class="nmsg"><strong>' + esc(notifText(n)) + "</strong><br><small>" + esc(relTime(n.time)) + "</small></div>" +
    "</div>"));
  });
  v.appendChild(card);
  app.appendChild(v);

  var mr = document.getElementById("markRead");
  if (mr) mr.addEventListener("click", function () {
    var db2 = loadDB();
    db2.notifications.forEach(function (n) { if (n.farmerId === farmer.id) n.read = true; });
    saveDB(db2); render();
  });

  // auto mark read after viewing
  setTimeout(function () {
    var db2 = loadDB(); var changed = false;
    db2.notifications.forEach(function (n) { if (n.farmerId === farmer.id && !n.read) { n.read = true; changed = true; } });
    if (changed) { saveDB(db2); notifDot.hidden = true; }
  }, 1200);
}

/* ---------- Help / grievance ---------- */
function viewHelp(db) {
  var farmer = getFarmer(db, db.session.farmerId);
  var v = el('<section class="view"></section>');
  v.appendChild(el('<div class="page-head"><h1>' + esc(t("help_title")) + '</h1><p>' + esc(t("help_sub")) + "</p></div>"));

  // helpline
  v.appendChild(el('<div class="card" style="display:flex;align-items:center;gap:12px">' +
    '<div class="avatar" style="width:44px;height:44px;border-radius:12px;display:grid;place-items:center">' + iconHelp() + "</div>" +
    '<div style="flex:1"><strong>' + esc(t("help_helpline")) + '</strong><div style="color:var(--muted);font-size:.85rem">1800-180-1551 (Kisan Call Centre)</div></div>' +
  "</div>"));

  // new grievance form
  var form = el('<div class="card" style="margin-top:12px"></div>');
  form.appendChild(el('<div class="section-title" style="margin-top:0"><h2>' + esc(t("grievance_new")) + "</h2></div>"));
  form.appendChild(el('<div class="field"><label>' + esc(t("subject_label")) + '</label><input id="g_subject" placeholder="' + esc(t("subject_ph")) + '" /></div>'));
  form.appendChild(el('<div class="field"><label>' + esc(t("category_label")) + '</label><select id="g_cat">' +
    '<option value="payment">' + esc(t("cat_payment")) + "</option>" +
    '<option value="quality">' + esc(t("cat_quality")) + "</option>" +
    '<option value="slot">' + esc(t("cat_slot")) + "</option>" +
    '<option value="other">' + esc(t("cat_other")) + "</option></select></div>"));
  form.appendChild(el('<div class="field"><label>' + esc(t("message_label")) + '</label><textarea id="g_msg" placeholder="' + esc(t("message_ph")) + '"></textarea></div>'));
  var sub = el('<button class="btn btn-amber">' + esc(t("submit_grievance")) + "</button>");
  form.appendChild(sub);
  v.appendChild(form);

  sub.addEventListener("click", function () {
    var subject = form.querySelector("#g_subject").value.trim();
    var msg = form.querySelector("#g_msg").value.trim();
    if (!subject || !msg) { toast(t("message_label"), "warn"); return; }
    var db2 = loadDB();
    var ref = "G" + (db2.grievances.length + 101);
    db2.grievances.unshift({
      id: uid("g"), ref: ref, farmerId: farmer.id, subject: subject,
      category: form.querySelector("#g_cat").value, message: msg,
      status: "open", createdAt: Date.now()
    });
    saveDB(db2);
    toast(t("grievance_done") + " " + ref, "ok");
    render();
  });

  // my grievances
  var mine = db.grievances.filter(function (g) { return g.farmerId === farmer.id; });
  var listCard = el('<div style="margin-top:16px"></div>');
  listCard.appendChild(el('<div class="section-title"><h2>' + esc(t("my_grievances")) + "</h2></div>"));
  if (!mine.length) {
    listCard.appendChild(el('<div class="card"><p class="hint" style="margin:0">' + esc(t("no_grievance")) + "</p></div>"));
  } else {
    var g = el('<div class="grid"></div>');
    mine.forEach(function (gr) {
      g.appendChild(el('<div class="card">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
          "<div><strong>" + esc(gr.subject) + '</strong><div style="color:var(--muted);font-size:.82rem">' + esc(gr.ref) + " · " + esc(catLabel(gr.category)) + " · " + esc(relTime(gr.createdAt)) + "</div></div>" +
          '<span class="badge ' + (gr.status === "open" ? "warn" : "ok") + '">' + esc(gr.status === "open" ? t("g_open") : t("g_resolved")) + "</span>" +
        "</div>" +
        '<p style="margin:10px 0 0;color:var(--muted);font-size:.88rem">' + esc(gr.message) + "</p>" +
      "</div>"));
    });
    listCard.appendChild(g);
  }
  v.appendChild(listCard);
  app.appendChild(v);
}

function catLabel(c) { return t("cat_" + c); }

/* ---------- Centre Desk (admin) ---------- */
function viewDesk(db) {
  var v = el('<section class="view"></section>');
  var head = el('<div class="desk-header"></div>');
  head.appendChild(el('<div><h1 style="margin:0;font-size:1.3rem">' + esc(t("desk_title")) + '</h1><p style="margin:0;color:var(--muted);font-size:.88rem">' + esc(t("desk_sub")) + "</p></div>"));
  var backBtn = el('<a class="btn btn-outline btn-sm" href="' + (db.session.farmerId ? "#/home" : "#/login") + '">' + esc(t("back_to_farmer")) + "</a>");
  head.appendChild(backBtn);
  v.appendChild(head);

  if (!UI.deskCentre) UI.deskCentre = db.centres[0].id;
  var date = _todayISO(0);

  // centre selector
  var sel = el('<div class="field" style="margin-top:14px"><label>' + esc(t("desk_pick")) + '</label><select id="deskCentre"></select></div>');
  var selEl = sel.querySelector("select");
  db.centres.forEach(function (c) {
    selEl.appendChild(el('<option value="' + c.id + '"' + (c.id === UI.deskCentre ? " selected" : "") + ">" + esc(centreName(c)) + " — " + esc(centreDist(c)) + "</option>"));
  });
  v.appendChild(sel);
  selEl.addEventListener("change", function (e) { UI.deskCentre = e.target.value; render(); });

  var q = centreQueue(db, UI.deskCentre, date);
  var waiting = q.filter(function (b) { return b.status === "booked"; }).length;
  var serving = q.filter(function (b) { return b.status === "serving"; }).length;
  var procured = q.filter(function (b) { return b.status === "procured" || b.status === "paid"; }).length;
  var paid = q.filter(function (b) { return b.status === "paid"; }).length;

  var stats = el('<div class="stat-row"></div>');
  stats.appendChild(el('<div class="stat"><b>' + waiting + "</b><span>" + esc(t("stat_waiting")) + "</span></div>"));
  stats.appendChild(el('<div class="stat"><b>' + serving + "</b><span>" + esc(t("stat_serving")) + "</span></div>"));
  stats.appendChild(el('<div class="stat"><b>' + procured + "</b><span>" + esc(t("stat_procured")) + "</span></div>"));
  stats.appendChild(el('<div class="stat"><b>' + paid + "</b><span>" + esc(t("stat_paid")) + "</span></div>"));
  v.appendChild(stats);

  // call next
  var callBtn = el('<button class="btn btn-primary" id="callNext">' + esc(t("call_next")) + "</button>");
  callBtn.addEventListener("click", function () {
    var db2 = loadDB();
    var qq = centreQueue(db2, UI.deskCentre, date);
    // do not call next if someone is already serving
    var alreadyServing = qq.filter(function (b) { return b.status === "serving"; })[0];
    if (alreadyServing) { toast(t("being_served"), "warn"); return; }
    var next = qq.filter(function (b) { return b.status === "booked"; })[0];
    if (!next) { toast(t("no_queue"), "warn"); return; }
    next.status = "serving";
    addNotification(db2, next.farmerId, "notif_called", { token: next.token });
    saveDB(db2);
    toast(t("called_farmer") + " #" + next.token, "ok");
    render();
  });
  v.appendChild(callBtn);

  // queue list
  v.appendChild(el('<div class="section-title"><h2>' + esc(t("todays_queue")) + " · " + esc(fmtDate(date)) + "</h2></div>"));
  if (!q.length) {
    v.appendChild(emptyState(iconPeople(), t("no_queue")));
    app.appendChild(v);
    return;
  }

  var listWrap = el("<div></div>");
  q.forEach(function (b) {
    var f = getFarmer(db, b.farmerId);
    var row = el('<div class="queue-row ' + (b.status === "serving" ? "serving" : "") + '"></div>');
    row.appendChild(el('<div class="qtoken">#' + b.token + "</div>"));
    row.appendChild(el('<div class="qr-main"><strong>' + esc(f ? f.name : t("farmer_word")) + "</strong>" +
      "<small>" + esc(cropName(b.crop)) + " · " + esc(b.qty) + " " + esc(t("quintal")) + " · " + esc(b.slot) + "</small></div>"));

    var act = el('<div class="qr-actions"></div>');
    if (b.status === "booked") {
      act.appendChild(el("<div>" + statusBadge(b.status) + "</div>"));
    } else if (b.status === "serving") {
      var proc = el('<button class="btn btn-primary btn-sm">' + esc(t("mark_procured")) + "</button>");
      proc.addEventListener("click", function () {
        var db2 = loadDB();
        var bb = db2.bookings.filter(function (x) { return x.id === b.id; })[0];
        bb.status = "procured"; bb.procuredAt = Date.now();
        addNotification(db2, bb.farmerId, "notif_procured", { token: bb.token });
        saveDB(db2); toast(t("procured_ok"), "ok"); render();
      });
      act.appendChild(proc);
    } else if (b.status === "procured") {
      var payb = el('<button class="btn btn-amber btn-sm">' + esc(t("mark_paid")) + "</button>");
      payb.addEventListener("click", function () {
        var db2 = loadDB();
        var bb = db2.bookings.filter(function (x) { return x.id === b.id; })[0];
        bb.status = "paid"; bb.paidAt = Date.now();
        addNotification(db2, bb.farmerId, "notif_paid", { token: bb.token });
        saveDB(db2); toast(t("paid_ok"), "ok"); render();
      });
      act.appendChild(el("<div>" + statusBadge("procured") + "</div>"));
      act.appendChild(payb);
    } else if (b.status === "paid") {
      act.appendChild(el("<div>" + statusBadge("paid") + "</div>"));
    }
    row.appendChild(act);
    listWrap.appendChild(row);
  });
  v.appendChild(listWrap);
  app.appendChild(v);
}

/* ---------- shared empty state ---------- */
function emptyState(icon, text, btnText, href) {
  var e = el('<div class="empty"><div>' + icon.replace(/width="\d+" height="\d+"/, 'width="54" height="54"') + "</div><p>" + esc(text) + "</p></div>");
  if (btnText && href) e.appendChild(el('<a class="btn btn-primary btn-sm" href="' + href + '" style="display:inline-flex">' + esc(btnText) + "</a>"));
  return e;
}

/* ---------- icons ---------- */
function iconSlot() { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'; }
function iconTicket() { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z"/></svg>'; }
function iconTrack() { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'; }
function iconPin() { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>'; }
function iconHistory() { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 2"/></svg>'; }
function iconHelp() { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3.5"/><path d="M12 17h.01"/></svg>'; }
function iconBell() { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>'; }
function iconCheck() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'; }
function iconWeigh() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0Zm14 0-3 7a3 3 0 0 0 6 0Z"/></svg>'; }
function iconBox() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/></svg>'; }
function iconRupee() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12M6 8h12M9 4c4 0 6 2 6 5s-2 5-6 5h-3l7 6"/></svg>'; }
function iconPeople() { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/></svg>'; }

/* boot */
boot();

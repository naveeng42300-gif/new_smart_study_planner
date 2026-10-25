$(function () {
  let tasks = [];
  let currentUsername = "";
  let authMode = "login";
  let timerInterval = null;
  let timerTotal = 25 * 60;
  let timerRemaining = timerTotal;
  let timerRunning = false;
  let timerLabel = "Focus";
  const CIRCUMFERENCE = 2 * Math.PI * 112;

  function toast(message, isError = false) {
    const el = $("#toast");
    el.text(message).toggleClass("error", isError).addClass("show");
    clearTimeout(toast.timeout);
    toast.timeout = setTimeout(() => el.removeClass("show"), 3200);
  }
  function api(options) {
    return $.ajax({ ...options, contentType: "application/json", dataType: "json" });
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function dateToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function prettyDate(value) {
    if (!value) return "No due date";
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    if (value === dateToday()) return "Due today";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function setAuthMode(mode) {
    authMode = mode;
    const register = mode === "register";
    $("#showLogin").toggleClass("active", !register);
    $("#showRegister").toggleClass("active", register);
    $("#confirmWrap").toggleClass("hidden", !register);
    $("#confirmPassword").prop("required", register).val("");
    $("#password").attr("autocomplete", register ? "new-password" : "current-password");
    $("#authTitle").text(register ? "Start fresh today." : "Good to see you.");
    $("#authSubtitle").text(register ? "Create your account and build better study habits." : "Sign in to pick up where you left off.");
    $("#authEyebrow").text(register ? "YOUR NEXT CHAPTER" : "WELCOME BACK");
    $("#authSubmit").html(register ? 'Create account <span>↗</span>' : 'Sign in <span>↗</span>');
    $("#password").attr("placeholder", register ? "At least 8 characters" : "Enter your password");
  }
  function validUsername(name) {
    // Client-side convenience only; server enforces the same rule.
    return /^\p{L}{3,20}$/u.test(name);
  }
  function showApp(username) {
    currentUsername = username || "Student";
    $("#authView").addClass("hidden");
    $("#appView").removeClass("hidden");
    $("#sideUsername").text(currentUsername);
    $("#welcomeName").text(currentUsername);
    $("#avatar").text([...currentUsername][0]?.toUpperCase() || "S");
    $("#todayDate").text(new Date().toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" }));
    $("#todayLabel").text(new Date().toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" }).toUpperCase());
    loadTasks();
  }
  function showAuth() {
    $("#appView").addClass("hidden");
    $("#authView").removeClass("hidden");
    $("#password").val("");
  }
  function loadTasks() {
    api({ url: "/api/tasks", method: "GET" })
      .done(data => { tasks = Array.isArray(data) ? data : []; renderAll(); })
      .fail(xhr => {
        if (xhr.status === 401) { showAuth(); toast("Please sign in again.", true); }
        else toast(xhr.responseJSON?.error || "Could not load tasks.", true);
      });
  }
  function taskMarkup(task) {
    const id = escapeHtml(task._id);
    const completed = Boolean(task.completed);
    return `<article class="task-row ${completed ? "is-completed" : ""}">
      <input class="task-check" type="checkbox" aria-label="Mark task complete" data-id="${id}" ${completed ? "checked" : ""}>
      <div class="task-main"><div class="task-title">${escapeHtml(task.subject)}</div><div class="task-subtitle">${escapeHtml(task.topic)}</div></div>
      <div class="task-meta"><span class="priority ${escapeHtml(task.priority || "Medium")}">${escapeHtml(task.priority || "Medium")}</span><span class="due-label">${escapeHtml(prettyDate(task.date))}</span><button class="delete-task" data-id="${id}" aria-label="Delete task" title="Delete task">×</button></div>
    </article>`;
  }
  function emptyMarkup(message) {
    return `<div class="empty-state"><span>✧</span>${escapeHtml(message)}</div>`;
  }
  function renderAll() {
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const pending = total - done;
    const due = tasks.filter(t => !t.completed && t.date === dateToday()).length;
    const rate = total ? Math.round(done / total * 100) : 0;
    $("#totalStat").text(total);
    $("#completedStat").text(done);
    $("#pendingStat").text(pending);
    $("#dueStat").text(due);
    $("#completionRate").text(`${rate}%`);
    $("#ringPercent").text(`${rate}%`);
    $("#progressRing").css("background", `conic-gradient(var(--purple) ${rate}%, #eeeafc ${rate}%)`);
    $("#legendDone").text(done);
    $("#legendPending").text(pending);
    $("#sideTaskCount").text(pending);
    $("#encouragement").text(total === 0 ? "Add your first task and start building momentum." : rate === 100 ? "Wonderful work — you completed everything!" : rate >= 60 ? "You're building great momentum. Keep going!" : "Every completed task is progress. Keep at it!");
    const sorted = [...tasks].sort((a,b) => (a.completed - b.completed) || String(a.date).localeCompare(String(b.date)));
    const upcoming = sorted.filter(t => !t.completed).slice(0, 4);
    $("#upcomingTasks").html(upcoming.length ? upcoming.map(taskMarkup).join("") : emptyMarkup(total ? "All caught up! Enjoy the breathing room." : "Nothing planned yet. Add a task to get started."));
    const query = $("#taskSearch").val()?.trim().toLocaleLowerCase() || "";
    const filter = $("#taskFilter").val() || "all";
    const priority = $("#priorityFilter").val() || "all";
    const filtered = sorted.filter(t => {
      const matchesQuery = `${t.subject} ${t.topic}`.toLocaleLowerCase().includes(query);
      const matchesFilter = filter === "all" || (filter === "pending" && !t.completed) || (filter === "completed" && t.completed) || (filter === "today" && t.date === dateToday());
      return matchesQuery && matchesFilter && (priority === "all" || (t.priority || "Medium") === priority);
    });
    $("#allTasks").html(filtered.length ? filtered.map(taskMarkup).join("") : emptyMarkup(total ? "No tasks match these filters." : "Your task list is clear. Add a task when you're ready."));
  }
  function openTaskModal() {
    $("#taskForm")[0].reset();
    $("#dueDate").val(dateToday());
    $("#taskModal").removeClass("hidden");
    setTimeout(() => $("#subject").trigger("focus"), 50);
  }
  function closeTaskModal() { $("#taskModal").addClass("hidden"); }
  function navigate(section) {
    const titles = { overview: "Your overview", tasks: "My tasks", focus: "Focus timer" };
    $(".content-section").addClass("hidden");
    $(`#${section}Section`).removeClass("hidden");
    $(".nav-item").removeClass("active").filter(`[data-section="${section}"]`).addClass("active");
    $("#pageTitle").text(titles[section] || "Your overview");
    if (section === "tasks") renderAll();
  }

  $("#showLogin").on("click", () => setAuthMode("login"));
  $("#showRegister").on("click", () => setAuthMode("register"));
  $("#togglePassword").on("click", function () {
    const field = $("#password");
    const reveal = field.attr("type") === "password";
    field.attr("type", reveal ? "text" : "password");
    $(this).text(reveal ? "Hide" : "Show").attr("aria-label", reveal ? "Hide password" : "Show password");
  });
  $("#authForm").on("submit", function (event) {
    event.preventDefault();
    const username = $("#username").val().trim();
    const password = $("#password").val();
    if (!validUsername(username)) {
      toast("Username must be 3–20 letters only, without numbers, spaces, or symbols.", true);
      $("#username").trigger("focus");
      return;
    }
    if (typeof password !== "string" || password.length < (authMode === "register" ? 8 : 1)) {
      toast(authMode === "register" ? "Password must be at least 8 characters." : "Enter your password.", true);
      return;
    }
    if (authMode === "register" && password !== $("#confirmPassword").val()) {
      toast("Your passwords do not match.", true);
      return;
    }
    const endpoint = authMode === "register" ? "/api/register" : "/api/login";
    $("#authSubmit").prop("disabled", true).text(authMode === "register" ? "Creating account…" : "Signing in…");
    api({ url: endpoint, method: "POST", data: JSON.stringify({ username, password }) })
      .done(data => {
        toast(data.message || "Success!");
        showApp(data.username || username);
      })
      .fail(xhr => toast(xhr.responseJSON?.error || "Something went wrong. Please try again.", true))
      .always(() => {
        $("#authSubmit").prop("disabled", false);
        $("#authSubmit").html(authMode === "register" ? 'Create account <span>↗</span>' : 'Sign in <span>↗</span>');
      });
  });
  $("#logoutBtn").on("click", function () {
    api({ url: "/api/logout", method: "POST", data: "{}" })
      .always(() => { tasks = []; showAuth(); setAuthMode("login"); toast("You have been logged out."); });
  });
  $("#quickAdd,#taskAddButton").on("click", openTaskModal);
  $("#closeModal").on("click", closeTaskModal);
  $("#taskModal").on("click", e => { if (e.target === e.currentTarget) closeTaskModal(); });
  $(document).on("keydown", e => { if (e.key === "Escape") closeTaskModal(); });
  $("#taskForm").on("submit", function (event) {
    event.preventDefault();
    const payload = {
      subject: $("#subject").val().trim(),
      topic: $("#topic").val().trim(),
      date: $("#dueDate").val(),
      priority: $("#priority").val()
    };
    if (!payload.subject || !payload.topic || !payload.date) return toast("Please complete all task fields.", true);
    api({ url: "/api/tasks", method: "POST", data: JSON.stringify(payload) })
      .done(task => { tasks.unshift(task); renderAll(); closeTaskModal(); toast("Task added to your planner."); })
      .fail(xhr => toast(xhr.responseJSON?.error || "Could not save task.", true));
  });
  $(document).on("change", ".task-check", function () {
    const id = $(this).data("id");
    const completed = $(this).is(":checked");
    api({ url: `/api/tasks/${encodeURIComponent(id)}`, method: "PATCH", data: JSON.stringify({ completed }) })
      .done(() => {
        const task = tasks.find(t => String(t._id) === String(id));
        if (task) task.completed = completed;
        renderAll();
        toast(completed ? "Task completed. Nice work!" : "Task marked as pending.");
      })
      .fail(xhr => { toast(xhr.responseJSON?.error || "Could not update task.", true); loadTasks(); });
  });
  $(document).on("click", ".delete-task", function () {
    const id = String($(this).data("id"));
    const task = tasks.find(t => String(t._id) === id);
    if (!task || !window.confirm(`Delete "${task.subject}"? This cannot be undone.`)) return;
    api({ url: `/api/tasks/${encodeURIComponent(id)}`, method: "DELETE", data: "{}" })
      .done(() => { tasks = tasks.filter(t => String(t._id) !== id); renderAll(); toast("Task deleted."); })
      .fail(xhr => toast(xhr.responseJSON?.error || "Could not delete task.", true));
  });
  $("#taskSearch,#taskFilter,#priorityFilter").on("input change", renderAll);
  $(".nav-item").on("click", function () { navigate($(this).data("section")); });
  $("[data-goto]").on("click", function () { navigate($(this).data("goto")); });
  $(".focus-mode").on("click", function () {
    stopTimer();
    $(".focus-mode").removeClass("active");
    $(this).addClass("active");
    timerLabel = $(this).data("label");
    timerTotal = Number($(this).data("minutes")) * 60;
    timerRemaining = timerTotal;
    updateTimer();
  });
  function updateTimer() {
    const minutes = Math.floor(timerRemaining / 60);
    const seconds = timerRemaining % 60;
    $("#timerDisplay").text(`${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`);
    $("#timerCaption").text(timerLabel.toUpperCase() + (timerRunning ? " IN PROGRESS" : ""));
    const progress = timerTotal ? timerRemaining / timerTotal : 0;
    $("#timerProgress").css("stroke-dasharray", CIRCUMFERENCE).css("stroke-dashoffset", CIRCUMFERENCE * (1-progress));
    $("#timerStart").html(timerRunning ? "Ⅱ Pause timer" : (timerRemaining === 0 ? "↻ Start again" : "▶ " + (timerRemaining === timerTotal ? "Start focus" : "Resume timer")));
  }
  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerRunning = false;
    updateTimer();
  }
  $("#timerStart").on("click", function () {
    if (timerRunning) { stopTimer(); return; }
    if (timerRemaining <= 0) timerRemaining = timerTotal;
    timerRunning = true;
    updateTimer();
    timerInterval = setInterval(() => {
      timerRemaining--;
      if (timerRemaining <= 0) {
        timerRemaining = 0;
        stopTimer();
        toast(`${timerLabel} session finished! Take a breath.`);
        if ("Notification" in window && Notification.permission === "granted") new Notification("StudyFlow", { body: `${timerLabel} session finished!` });
      } else updateTimer();
    }, 1000);
    if ("Notification" in window && Notification.permission === "default") {
      // Ask only after the user has explicitly started the timer.
      Notification.requestPermission().catch(() => {});
    }
  });
  $("#timerReset").on("click", () => { stopTimer(); timerRemaining = timerTotal; updateTimer(); });
  updateTimer();
  setAuthMode("login");
  api({ url: "/api/me", method: "GET" })
    .done(data => showApp(data.username))
    .fail(() => showAuth());
});

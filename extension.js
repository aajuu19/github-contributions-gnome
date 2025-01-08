const { St, Clutter } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Gio = imports.gi.Gio;
const Soup = imports.gi.Soup;
const GLib = imports.gi.GLib;

const GITHUB_USERNAME = "aajuu19"; // Replace with your GitHub username

const BASE_QUERY = `
{
  user(login: "${GITHUB_USERNAME}") {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
`;

class GitHubContributionsIndicator extends PanelMenu.Button {
  constructor(token) {
    super(0.0, "GitHub Stats", false);

    // Create the label
    this.label = new St.Label({
      text: "🔥 0 🍎 0 💪 0 📊 0",
      y_align: Clutter.ActorAlign.CENTER,
    });

    this.add_child(this.label);

    // Initialize contributions data
    this.currentStreak = 0;
    this.longestStreak = 0;
    this.todayContributions = 0;
    this.yearContributions = 0;

    // Fetch data initially
    this.fetchData(token);

    // Refresh data every hour
    GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3600, () => {
      this.fetchData(token);
      return GLib.SOURCE_CONTINUE;
    });
  }

  fetchData(token) {
    let session = new Soup.Session();
    let message = Soup.Message.new("POST", "https://api.github.com/graphql");
    message.request_headers.append("Content-Type", "application/json");
    message.request_headers.append("Authorization", `Bearer ${token}`);
    const body = JSON.stringify({ query: BASE_QUERY });
    message.set_request(
      "application/json",
      Soup.MemoryUse.COPY,
      body,
      body.length,
    );

    session.queue_message(message, (session, message) => {
      if (message.status_code === 200) {
        let response = JSON.parse(message.response_body.data);
        this.processData(
          response.data.user.contributionsCollection.contributionCalendar,
        );
      } else {
        log(`Error fetching data: ${message.status_code}`);
      }
    });
  }

  processData(contributionCalendar) {
    const contributionDays = contributionCalendar.weeks.flatMap(
      (week) => week.contributionDays,
    );
    const today = new Date().toISOString().split("T")[0];

    // Calculate statistics
    this.todayContributions = this.getContributionsByDate(
      contributionDays,
      (date) => date === today,
    );
    this.currentStreak = this.calculateStreak(contributionDays).currentStreak;
    this.longestStreak = this.calculateStreak(contributionDays).longestStreak;
    this.yearContributions = this.getContributionsByDate(
      contributionDays,
      (date) =>
        new Date(date) >=
        new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
    );

    // Update the label
    this.label.set_text(
      `🔥 ${this.currentStreak} 🍎 ${this.longestStreak} 💪 ${this.todayContributions} 📊 ${this.yearContributions}`,
    );

    // Update the dropdown menu
    this.updateMenu(contributionDays);
  }

  getContributionsByDate(contributionDays, filterFn) {
    return contributionDays
      .filter((day) => filterFn(day.date))
      .reduce((acc, day) => acc + day.contributionCount, 0);
  }

  calculateStreak(contributionDays) {
    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 0;

    // Sort days by date ascending
    const sortedDays = contributionDays.sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );

    sortedDays.forEach((day) => {
      if (day.contributionCount > 0) {
        streak += 1;
        if (streak > longestStreak) {
          longestStreak = streak;
        }
      } else {
        streak = 0;
      }
    });

    currentStreak = streak;
    return { currentStreak, longestStreak };
  }

  updateMenu(contributionDays) {
    this.menu.removeAll();

    // Streaks Section
    let streakSection = new PopupMenu.PopupMenuSection("Streaks");
    this.menu.addMenuItem(streakSection);

    let currentStreakItem = new PopupMenu.PopupMenuItem(
      `🔥 Current Streak: ${this.currentStreak}`,
    );
    streakSection.addMenuItem(currentStreakItem);

    let longestStreakItem = new PopupMenu.PopupMenuItem(
      `🍎 Longest Streak: ${this.longestStreak}`,
    );
    streakSection.addMenuItem(longestStreakItem);

    // Contributions Stats Section
    let statsSection = new PopupMenu.PopupMenuSection("Contribution Stats");
    this.menu.addMenuItem(statsSection);

    let todayItem = new PopupMenu.PopupMenuItem(
      `💪 Today: ${this.todayContributions}`,
    );
    statsSection.addMenuItem(todayItem);

    let yearItem = new PopupMenu.PopupMenuItem(
      `📊 Last 365 Days: ${this.yearContributions}`,
    );
    statsSection.addMenuItem(yearItem);

    // Add more sections or items as needed
  }
}

let indicator = null;

function init() {
  log("Github Stats Extension Initialized");
}

function enable() {
  // Initialize GSettings
  let settings = Gio.Settings.new("org.gnome.shell.extensions.github-stats");
  let token = settings.get_string("github-token");

  if (!token) {
    log("GitHub token not set. Please set it using gsettings.");
    return;
  }

  indicator = new GitHubContributionsIndicator(token);
  Main.panel.addToStatusArea("github-stats", indicator);
}

function disable() {
  if (indicator) {
    indicator.destroy();
    indicator = null;
  }
}

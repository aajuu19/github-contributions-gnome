const { St, GLib } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Soup = imports.gi.Soup; // For HTTP requests

let _contributionExtension = null;

class ContributionExtension extends PanelMenu.Button {
  constructor() {
    // 0.0 is the menu alignment, “GitHub Contributions” is the accessible name
    super(0.0, "GitHub Contributions");

    // You can use any icon from icon theme or create your own
    const icon = new St.Icon({
      icon_name: "avatar-default-symbolic",
      style_class: "system-status-icon",
    });

    this.add_child(icon);

    // Add items to the drop-down menu
    // We’ll later populate these or update them with real data
    this._streakItem = new PopupMenu.PopupMenuItem("Streaks: Loading...");
    this.menu.addMenuItem(this._streakItem);

    // Separator
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    this._todayItem = new PopupMenu.PopupMenuItem("Today: Loading...");
    this.menu.addMenuItem(this._todayItem);

    this._monthItem = new PopupMenu.PopupMenuItem("This Month: Loading...");
    this.menu.addMenuItem(this._monthItem);

    this._yearItem = new PopupMenu.PopupMenuItem("Year: Loading...");
    this.menu.addMenuItem(this._yearItem);

    // Fetch data on init
    this._fetchGitHubContributions();
  }

  _fetchGitHubContributions() {
    // Build your query
    const baseQuery = `
      {
        user(login: "aajuu19") {
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

    const session = new Soup.Session();
    // Required for some Gnome versions
    Soup.Session.prototype.add_feature.call(
      session,
      new Soup.ProxyResolverDefault(),
    );

    const message = Soup.Message.new("POST", "https://api.github.com/graphql");
    message.request_headers.append("Content-Type", "application/json");
    // Replace <TOKEN> with your actual personal token
    message.request_headers.append("Authorization", "Bearer <my-token>");

    // JSON body
    const body = JSON.stringify({ query: baseQuery });
    message.set_request_body_from_bytes(GLib.Bytes.new(body));

    session.send_and_read_async(
      message,
      GLib.PRIORITY_DEFAULT,
      null,
      (obj, res) => {
        try {
          const responseBytes = session.send_and_read_finish(res);
          const responseBody = new TextDecoder().decode(
            responseBytes.get_data(),
          );
          const json = JSON.parse(responseBody);

          // At this point, you have your contributions data
          const contributionCalendar =
            json.data.user.contributionsCollection.contributionCalendar;
          if (!contributionCalendar) {
            log("No contribution calendar data found");
            return;
          }

          const contributionDays = [];
          for (const week of contributionCalendar.weeks) {
            contributionDays.push(...week.contributionDays);
          }

          // Use your streak calculation logic here
          const { currentStreak, longestStreak } =
            this._calculateStreak(contributionDays);

          // Calculate any other stats
          const todayContributions =
            this._getTodayContributions(contributionDays);
          const monthContributions =
            this._getMonthContributions(contributionDays);
          const yearContributions =
            this._getYearContributions(contributionDays);

          // Update the panel display (the top bar)
          this.label = `🔥${currentStreak} 🍎${longestStreak}`; // for the top bar

          // Update the menu items
          this._streakItem.label.text = `Streaks: Current ${currentStreak}, Longest ${longestStreak}`;
          this._todayItem.label.text = `Today: ${todayContributions}`;
          this._monthItem.label.text = `This Month: ${monthContributions}`;
          this._yearItem.label.text = `Year: ${yearContributions}`;
        } catch (e) {
          logError(e);
        }
      },
    );
  }

  // Example streak calculation (adapt your existing code)
  _calculateStreak(contributionDays) {
    let longestStreak = 0;
    let currentStreak = 0;

    // Very naive example: just a running sum
    let streakCount = 0;
    for (let i = 0; i < contributionDays.length; i++) {
      const day = contributionDays[i];
      if (day.contributionCount > 0) {
        streakCount++;
        if (streakCount > longestStreak) {
          longestStreak = streakCount;
        }
      } else {
        streakCount = 0;
      }
    }
    // Let’s pretend the “current streak” is the same as last streakCount
    currentStreak = streakCount;

    return { currentStreak, longestStreak };
  }

  // Example daily/monthly/yearly calculations
  _getTodayContributions(contributionDays) {
    const today = this._formatDate(new Date());
    return contributionDays
      .filter((d) => d.date === today)
      .reduce((sum, d) => sum + d.contributionCount, 0);
  }

  _getMonthContributions(contributionDays) {
    const firstOfMonth = this._formatDate(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    );
    return contributionDays
      .filter((d) => d.date >= firstOfMonth)
      .reduce((sum, d) => sum + d.contributionCount, 0);
  }

  _getYearContributions(contributionDays) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const compareDate = this._formatDate(oneYearAgo);

    return contributionDays
      .filter((d) => d.date >= compareDate)
      .reduce((sum, d) => sum + d.contributionCount, 0);
  }

  _formatDate(date) {
    // Return 'YYYY-MM-DD'
    const yyyy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, "0");
    const dd = date.getDate().toString().padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
}

// Gnome Shell extension entry points
function init() {
  // Called when extension is (re)loaded
}

function enable() {
  // Called when extension is enabled by user
  _contributionExtension = new ContributionExtension();
  Main.panel.addToStatusArea(
    "github-contributions",
    _contributionExtension,
    0,
    "right",
  );
}

function disable() {
  // Called when extension is disabled by user
  if (_contributionExtension !== null) {
    _contributionExtension.destroy();
    _contributionExtension = null;
  }
}

# 🍽️ Bistro Buddies

A cozy isometric restaurant sim that runs in the browser. It's one HTML file with no libraries.

**Play:** https://florencewmk.github.io/bistro-buddies/

## How it plays
- Animal customers 🐱🐻🐰🐸🦊 walk in on their own, find a seat, order, eat, pay and leave.
- Your crew are bots too: **chefs** cook at stoves, **waiters** take orders and carry food, and **cleaners** pick up trash and unclog the restroom.
- Staff get sleepy over time. Serve ☕ coffee to wake them up.
- Popularity ❤️ brings in more customers. Slow service, trash and clogged restrooms lower it.
- Level up ⭐ to unlock new dishes and decor. Upgrade dishes on the **Menu**, and place furniture with **Build**.
- Progress saves automatically in your browser.

## How the bots work
Each customer is a small **finite state machine**:

`queue → enter → seat → waitFood → eat → (toToilet → useToilet) → leave`

Patience drains while they wait, and nicer decor makes it drain more slowly. If patience runs out, the customer leaves angry. Staff pick the most urgent job (deliver ready food > take orders, trash > repairs) and walk there using breadth-first-search pathfinding on the tile grid.

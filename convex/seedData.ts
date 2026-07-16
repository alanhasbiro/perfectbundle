import type { CuratedBundle } from "../src/lib/engine/schemas";

export const seedCuratedBundles: CuratedBundle[] = [
  {
    title: "The Coffee Ritual",
    theme: "Slow coffee mornings",
    rationale: "For someone who treats coffee as a ceremony, not caffeine delivery.",
    estTotal: "$45–60",
    priceBand: "under-75",
    approved: true,
    sortWeight: 100,
    items: [
      { name: "Ceramic pour-over dripper set", description: "One-cup ceramic dripper with matching mug.", why: "Turns the morning cup into a ritual.", estPriceRange: "$18–25", searchQuery: "ceramic pour over coffee dripper set", tags: ["coffee", "home"] },
      { name: "Single-origin coffee sampler", description: "Three small bags from different regions.", why: "Lets them taste their way around the world.", estPriceRange: "$15–20", searchQuery: "single origin coffee sampler gift", tags: ["coffee", "food"] },
      { name: "Gooseneck pouring kettle", description: "Small stovetop kettle with precision spout.", why: "The tool that makes pour-over actually work.", estPriceRange: "$20–30", searchQuery: "gooseneck pour over kettle stovetop", tags: ["coffee", "kitchen"] },
    ],
  },
  {
    title: "The Cozy Reader",
    theme: "A perfect reading night in",
    rationale: "Everything a book lover needs to disappear for an evening.",
    estTotal: "$40–55",
    priceBand: "under-75",
    approved: true,
    sortWeight: 90,
    items: [
      { name: "Rechargeable book light", description: "Clip-on warm-light lamp for reading in bed.", why: "Reading after everyone's asleep, guilt-free.", estPriceRange: "$12–18", searchQuery: "rechargeable clip on book reading light warm", tags: ["reading", "gadgets"] },
      { name: "Herbal tea gift tin", description: "Caffeine-free evening blends in a keepsake tin.", why: "The right companion for a long chapter.", estPriceRange: "$14–20", searchQuery: "herbal tea sampler gift tin", tags: ["tea", "food"] },
      { name: "Chunky knit throw blanket", description: "Soft oversized blanket for the reading chair.", why: "Cozy is a requirement, not a luxury.", estPriceRange: "$25–35", searchQuery: "chunky knit throw blanket soft", tags: ["home", "cozy"] },
    ],
  },
  {
    title: "New Parent Survival Kit",
    theme: "Comfort for exhausted new parents",
    rationale: "Gifts for the parents, not the baby — they need it more.",
    estTotal: "$50–70",
    priceBand: "under-75",
    approved: true,
    sortWeight: 80,
    items: [
      { name: "Insulated self-heating mug", description: "Temperature-holding mug for forgotten coffees.", why: "Every new parent drinks cold coffee. Not anymore.", estPriceRange: "$20–30", searchQuery: "temperature control insulated smart mug", tags: ["parents", "gadgets"] },
      { name: "Silk sleep eye mask", description: "Blackout silk mask for daytime naps.", why: "Sleep is the most precious gift now.", estPriceRange: "$12–18", searchQuery: "silk sleep eye mask blackout", tags: ["sleep", "selfcare"] },
      { name: "One-handed snack box", description: "Assorted eat-with-one-hand snacks.", why: "The other hand is holding a baby.", estPriceRange: "$18–25", searchQuery: "healthy snack box gift assortment", tags: ["food", "parents"] },
    ],
  },
  {
    title: "Desk Upgrade, Under $50",
    theme: "Office Secret Santa that doesn't feel generic",
    rationale: "Small desk luxuries that colleagues actually keep.",
    estTotal: "$35–50",
    priceBand: "under-50",
    approved: true,
    sortWeight: 70,
    items: [
      { name: "Desktop mini plant kit", description: "Low-maintenance succulent in a ceramic pot.", why: "A living thing that survives office lighting.", estPriceRange: "$12–16", searchQuery: "desk succulent plant ceramic pot kit", tags: ["office", "plants"] },
      { name: "Magnetic cable organizer", description: "Silicone magnetic ties that end cable chaos.", why: "Solves a daily annoyance they'd never fix themselves.", estPriceRange: "$8–12", searchQuery: "magnetic cable organizer desk silicone", tags: ["office", "gadgets"] },
      { name: "Premium gel pen set", description: "Smooth-writing pens in a gift case.", why: "People who love good pens really love good pens.", estPriceRange: "$14–20", searchQuery: "premium gel pen gift set smooth", tags: ["office", "stationery"] },
    ],
  },
  {
    title: "The Home Chef's Edge",
    theme: "Level up a keen cook's kitchen",
    rationale: "Sharp, useful upgrades — no gimmick gadgets.",
    estTotal: "$55–75",
    priceBand: "under-75",
    approved: true,
    sortWeight: 60,
    items: [
      { name: "Flaky finishing salt", description: "Sea salt flakes in a wooden serving box.", why: "The 'restaurant secret' every cook appreciates.", estPriceRange: "$10–15", searchQuery: "maldon flaky sea salt gift box", tags: ["cooking", "food"] },
      { name: "Cast iron mini skillet", description: "Pre-seasoned skillet for single servings.", why: "Perfect for the one-pan cookie they deserve.", estPriceRange: "$15–22", searchQuery: "mini cast iron skillet pre seasoned", tags: ["cooking", "kitchen"] },
      { name: "Digital instant-read thermometer", description: "Fast probe thermometer for meat and baking.", why: "The single biggest cooking accuracy upgrade.", estPriceRange: "$18–28", searchQuery: "instant read digital meat thermometer", tags: ["cooking", "gadgets"] },
    ],
  },
];

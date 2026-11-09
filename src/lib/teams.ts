export type Franchise = {
  id: string;
  name: string;
  shortName: string;
  city: string;
  primary: string;
  secondary: string;
  ink: string;
  active: boolean;
};

export const FRANCHISES: Franchise[] = [
  {
    id: "chennai-super-kings",
    name: "Chennai Super Kings",
    shortName: "CSK",
    city: "Chennai",
    primary: "#F9CD05",
    secondary: "#1B2A4A",
    ink: "#101A2C",
    active: true,
  },
  {
    id: "mumbai-indians",
    name: "Mumbai Indians",
    shortName: "MI",
    city: "Mumbai",
    primary: "#004BA0",
    secondary: "#D1AB3E",
    ink: "#FFFFFF",
    active: true,
  },
  {
    id: "royal-challengers-bengaluru",
    name: "Royal Challengers Bengaluru",
    shortName: "RCB",
    city: "Bengaluru",
    primary: "#D5152C",
    secondary: "#1A1A1A",
    ink: "#FFFFFF",
    active: true,
  },
  {
    id: "kolkata-knight-riders",
    name: "Kolkata Knight Riders",
    shortName: "KKR",
    city: "Kolkata",
    primary: "#3A225D",
    secondary: "#D9B45B",
    ink: "#FFFFFF",
    active: true,
  },
  {
    id: "sunrisers-hyderabad",
    name: "Sunrisers Hyderabad",
    shortName: "SRH",
    city: "Hyderabad",
    primary: "#F26522",
    secondary: "#1B1B1B",
    ink: "#140B05",
    active: true,
  },
  {
    id: "delhi-capitals",
    name: "Delhi Capitals",
    shortName: "DC",
    city: "Delhi",
    primary: "#17449B",
    secondary: "#E4002B",
    ink: "#FFFFFF",
    active: true,
  },
  {
    id: "rajasthan-royals",
    name: "Rajasthan Royals",
    shortName: "RR",
    city: "Jaipur",
    primary: "#EA1A8E",
    secondary: "#254AA5",
    ink: "#FFFFFF",
    active: true,
  },
  {
    id: "punjab-kings",
    name: "Punjab Kings",
    shortName: "PBKS",
    city: "Mohali",
    primary: "#DD1F2D",
    secondary: "#C9A227",
    ink: "#FFFFFF",
    active: true,
  },
  {
    id: "gujarat-titans",
    name: "Gujarat Titans",
    shortName: "GT",
    city: "Ahmedabad",
    primary: "#1B2133",
    secondary: "#C8A96A",
    ink: "#FFFFFF",
    active: true,
  },
  {
    id: "lucknow-super-giants",
    name: "Lucknow Super Giants",
    shortName: "LSG",
    city: "Lucknow",
    primary: "#0057E7",
    secondary: "#F4A300",
    ink: "#FFFFFF",
    active: true,
  },
];

export const HISTORIC_FRANCHISES: Franchise[] = [
  {
    id: "deccan-chargers",
    name: "Deccan Chargers",
    shortName: "DC",
    city: "Hyderabad",
    primary: "#1B4F9C",
    secondary: "#B7B7B7",
    ink: "#FFFFFF",
    active: false,
  },
  {
    id: "kochi-tuskers-kerala",
    name: "Kochi Tuskers Kerala",
    shortName: "KTK",
    city: "Kochi",
    primary: "#F58220",
    secondary: "#4B2E83",
    ink: "#1A0D02",
    active: false,
  },
  {
    id: "pune-warriors",
    name: "Pune Warriors India",
    shortName: "PWI",
    city: "Pune",
    primary: "#1D3C6E",
    secondary: "#E0B04A",
    ink: "#FFFFFF",
    active: false,
  },
  {
    id: "gujarat-lions",
    name: "Gujarat Lions",
    shortName: "GL",
    city: "Rajkot",
    primary: "#E04B2B",
    secondary: "#1B3B6F",
    ink: "#FFFFFF",
    active: false,
  },
  {
    id: "rising-pune-supergiant",
    name: "Rising Pune Supergiant",
    shortName: "RPS",
    city: "Pune",
    primary: "#5B2C83",
    secondary: "#E2B54A",
    ink: "#FFFFFF",
    active: false,
  },
];

export const ALL_FRANCHISES = [...FRANCHISES, ...HISTORIC_FRANCHISES];

export function getFranchise(id: string | null | undefined): Franchise | undefined {
  if (!id) return undefined;
  return ALL_FRANCHISES.find((team) => team.id === id);
}

export function getActiveFranchise(id: string | null | undefined): Franchise | undefined {
  if (!id) return undefined;
  return FRANCHISES.find((team) => team.id === id);
}

export const TEAM_NAME_ALIASES: Record<string, string> = {
  "royal challengers bangalore": "royal-challengers-bengaluru",
  "royal challengers bengaluru": "royal-challengers-bengaluru",
  "delhi daredevils": "delhi-capitals",
  "delhi capitals": "delhi-capitals",
  "kings xi punjab": "punjab-kings",
  "kings xi punjab ": "punjab-kings",
  "punjab kings": "punjab-kings",
  "chennai super kings": "chennai-super-kings",
  "mumbai indians": "mumbai-indians",
  "kolkata knight riders": "kolkata-knight-riders",
  "sunrisers hyderabad": "sunrisers-hyderabad",
  "rajasthan royals": "rajasthan-royals",
  "gujarat titans": "gujarat-titans",
  "lucknow super giants": "lucknow-super-giants",
  "deccan chargers": "deccan-chargers",
  "kochi tuskers kerala": "kochi-tuskers-kerala",
  "pune warriors": "pune-warriors",
  "pune warriors india": "pune-warriors",
  "gujarat lions": "gujarat-lions",
  "rising pune supergiant": "rising-pune-supergiant",
  "rising pune supergiants": "rising-pune-supergiant",
};

export function teamIdFromName(name: string): string {
  const key = name.trim().toLowerCase();
  return TEAM_NAME_ALIASES[key] ?? key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function teamNameFromId(id: string): string {
  return getFranchise(id)?.name ?? id;
}

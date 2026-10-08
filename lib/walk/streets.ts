// The street grid around Broadway from West 20th to West 47th Street: every
// intersection (NODES) and the blocks between them (EDGES, [nodeA, nodeB,
// street name index]). Generated from OpenStreetMap (© OpenStreetMap
// contributors, ODbL), with dual carriageways and plaza splits merged into
// single intersections. Blocks are straight lines between intersections,
// which holds on Manhattan's grid. Client- and server-safe: data and math.

export const NODES: [number, number][] = [[40.757969,-73.985547],[40.742036,-73.982913],[40.744504,-73.98112],[40.744631,-73.985243],[40.743957,-73.98363],[40.741844,-73.982452],[40.742604,-73.980416],[40.752742,-73.996817],[40.754071,-73.995843],[40.754686,-73.995383],[40.758827,-73.992347],[40.745805,-73.982277],[40.758462,-73.986728],[40.756532,-73.994018],[40.75916,-73.988386],[40.740874,-73.98594],[40.743336,-73.98408],[40.742716,-73.984532],[40.75713,-73.993522],[40.744572,-73.983182],[40.742098,-73.984982],[40.75784,-73.993073],[40.741479,-73.985434],[40.745183,-73.982736],[40.759104,-73.992138],[40.744067,-73.987745],[40.746618,-73.993813],[40.747836,-73.996634],[40.756516,-73.985996],[40.756689,-73.986407],[40.743807,-73.989005],[40.753705,-73.996103],[40.749046,-73.988013],[40.749105,-73.984071],[40.74843,-73.982478],[40.757317,-73.993457],[40.757665,-73.994811],[40.749674,-73.995296],[40.750294,-73.994845],[40.742191,-73.989126],[40.755115,-73.996397],[40.742456,-73.988978],[40.747771,-73.982961],[40.743019,-73.989166],[40.74525,-73.984794],[40.75655,-73.996022],[40.743215,-73.979969],[40.742835,-73.988669],[40.757317,-73.985926],[40.758629,-73.98537],[40.755869,-73.986402],[40.746531,-73.985943],[40.751507,-73.997725],[40.753481,-73.980879],[40.756036,-73.986949],[40.758433,-73.992646],[40.74646,-73.981912],[40.747125,-73.981454],[40.749706,-73.991563],[40.757836,-73.987189],[40.741461,-73.993854],[40.741177,-73.989876],[40.751581,-73.982276],[40.748469,-73.992463],[40.749101,-73.992006],[40.755743,-73.995977],[40.740277,-73.990525],[40.747152,-73.98549],[40.750114,-73.998224],[40.750342,-73.991099],[40.748665,-73.99602],[40.756625,-73.986147],[40.748305,-73.988193],[40.75876,-73.99342],[40.748454,-73.984545],[40.751009,-73.990612],[40.757384,-73.996008],[40.743568,-73.992318],[40.753408,-73.996318],[40.744765,-73.995159],[40.745965,-73.99799],[40.744025,-73.999413],[40.757912,-73.989296],[40.745305,-73.998472],[40.740881,-73.987985],[40.74658,-73.99755],[40.747217,-73.997085],[40.748435,-73.996192],[40.745922,-73.986391],[40.742157,-73.987045],[40.751532,-73.993943],[40.752199,-73.993458],[40.743395,-73.986143],[40.753478,-73.992525],[40.752858,-73.992976],[40.744008,-73.985696],[40.754091,-73.992079],[40.75096,-73.982726],[40.75533,-73.991177],[40.745859,-73.984346],[40.755949,-73.990728],[40.746482,-73.983891],[40.756567,-73.990276],[40.753503,-73.988798],[40.747101,-73.983443],[40.757233,-73.989791],[40.755311,-73.994962],[40.754707,-73.991633],[40.749055,-73.982022],[40.749665,-73.98157],[40.758532,-73.988843],[40.750283,-73.981123],[40.755904,-73.994475],[40.745383,-73.994709],[40.746018,-73.994253],[40.750341,-73.983175],[40.741422,-73.989152],[40.741551,-73.989597],[40.744107,-73.995638],[40.751659,-73.990134],[40.752289,-73.989688],[40.752895,-73.989243],[40.754147,-73.988323],[40.754755,-73.987888],[40.755373,-73.987447],[40.758597,-73.985079],[40.759223,-73.984619],[40.756659,-73.978557],[40.745301,-73.986846],[40.746048,-73.98861],[40.746666,-73.990068],[40.754325,-73.986873],[40.754165,-73.980392],[40.747863,-73.992905],[40.749056,-73.995729],[40.743457,-73.988191],[40.742771,-73.986598],[40.742653,-73.982465],[40.741416,-73.983367],[40.758602,-73.994991],[40.756605,-73.982313],[40.752205,-73.981824],[40.758346,-73.996405],[40.754733,-73.997406],[40.755001,-73.980458],[40.740886,-73.990083],[40.743431,-73.99613],[40.741629,-73.993732],[40.744536,-73.988892],[40.742233,-73.993292],[40.74291,-73.992798],[40.745289,-73.988753],[40.744186,-73.991871],[40.746796,-73.988473],[40.744819,-73.991409],[40.745421,-73.990968],[40.747546,-73.988333],[40.746038,-73.990518],[40.747277,-73.989617],[40.750702,-73.997707],[40.747896,-73.989157],[40.748508,-73.988695],[40.749122,-73.988235],[40.750682,-73.987786],[40.749801,-73.987746],[40.751445,-73.987686],[40.750457,-73.987287],[40.751082,-73.986828],[40.75219,-73.987537],[40.7517,-73.986399],[40.752887,-73.987344],[40.747774,-73.985038],[40.752317,-73.985947],[40.752944,-73.985484],[40.753622,-73.98707],[40.753558,-73.98504],[40.754177,-73.984596],[40.755054,-73.986671],[40.754842,-73.984118],[40.755516,-73.983624],[40.758371,-73.994391],[40.756142,-73.983166],[40.758978,-73.993937],[40.756771,-73.982712],[40.75739,-73.982254],[40.758016,-73.981797],[40.744678,-73.987301],[40.747236,-73.993362],[40.759911,-73.980418],[40.752816,-73.98138],[40.741545,-73.987506],[40.749728,-73.983617]];

export const NAMES: string[] = ["5th Avenue", "6th Avenue", "7th Avenue", "8th Avenue", "9th Avenue", "Broadway", "Dyer Avenue", "East 23rd Street", "East 24th Street", "East 25th Street", "East 26th Street", "East 27th Street", "East 28th Street", "East 29th Street", "East 30th Street", "East 31st Street", "East 32nd Street", "East 33rd Street", "East 34th Street", "East 35th Street", "East 36th Street", "East 37th Street", "East 38th Street", "Lexington Avenue", "Madison Avenue", "Park Avenue South", "Shubert Alley", "West 20th Street", "West 21st Street", "West 22nd Street", "West 23rd Street", "West 24th Street", "West 25th Street", "West 26th Street", "West 27th Street", "West 28th Street", "West 29th Street", "West 30th Street", "West 31st Street", "West 32nd Street", "West 33rd Street", "West 34th Street", "West 35th Street", "West 36th Street", "West 37th Street", "West 38th Street", "West 39th Street", "West 40th Street", "West 41st Street", "West 42nd Street", "West 43rd Street", "West 44th Street", "West 45th Street", "West 46th Street", "West 47th Street"];

export const EDGES: [number, number, number][] = [[0,12,52],[0,48,5],[0,49,5],[0,125,2],[0,183,52],[1,5,11],[1,17,11],[1,137,23],[1,138,23],[2,23,15],[3,4,13],[3,44,24],[3,95,24],[3,128,13],[4,6,13],[4,16,25],[4,19,25],[7,90,40],[8,9,4],[8,31,4],[8,94,42],[8,143,42],[9,40,43],[9,93,43],[9,106,4],[10,55,4],[11,23,25],[11,101,16],[12,14,52],[12,59,26],[13,18,4],[13,76,46],[13,98,46],[13,112,4],[15,22,25],[15,190,8],[16,17,25],[16,95,12],[16,137,12],[17,20,25],[17,92,11],[18,35,4],[18,36,47],[18,100,47],[19,23,25],[19,44,14],[19,46,14],[20,22,25],[20,136,10],[20,138,10],[21,35,4],[21,55,4],[21,102,48],[21,180,48],[22,89,9],[23,99,15],[24,82,50],[25,92,11],[25,135,0],[25,148,34],[25,186,0],[26,27,34],[26,114,2],[26,155,34],[26,187,2],[28,71,50],[28,179,50],[29,48,2],[29,54,2],[29,71,50],[29,82,50],[30,43,5],[30,135,33],[30,148,5],[30,154,33],[32,72,5],[32,162,40],[32,171,40],[33,34,19],[33,74,0],[33,166,42],[33,191,0],[34,42,24],[36,142,47],[36,180,6],[37,38,3],[37,63,37],[37,134,3],[37,159,37],[38,52,38],[38,64,38],[38,90,3],[39,41,0],[39,77,31],[39,117,0],[41,43,5],[41,47,0],[42,57,18],[42,74,18],[42,104,24],[43,47,32],[43,152,32],[44,88,14],[44,99,24],[45,112,45],[47,135,0],[48,59,51],[48,71,5],[48,181,51],[50,54,49],[50,71,5],[50,177,5],[50,178,49],[51,67,0],[51,88,0],[51,99,15],[51,156,38],[53,178,49],[54,105,49],[54,124,2],[55,73,49],[55,105,49],[56,104,17],[58,64,2],[58,69,2],[58,161,39],[59,110,51],[60,147,1],[61,117,0],[62,97,0],[62,141,0],[62,173,46],[63,64,2],[63,133,2],[63,158,37],[64,160,38],[65,106,44],[66,147,28],[67,72,39],[67,101,16],[67,171,0],[68,134,36],[69,75,2],[69,162,40],[70,134,3],[72,156,5],[72,161,39],[74,164,41],[74,171,0],[75,91,41],[75,119,2],[75,164,41],[77,79,31],[77,150,1],[77,152,1],[78,91,41],[79,80,31],[79,113,2],[79,118,2],[81,147,28],[82,105,3],[82,110,3],[83,118,30],[84,190,24],[85,113,32],[86,114,33],[87,187,35],[88,128,0],[88,153,37],[89,136,24],[89,190,24],[90,91,3],[91,94,3],[92,95,24],[92,136,24],[93,94,3],[93,96,3],[93,120,43],[94,119,42],[95,186,12],[96,106,44],[96,107,3],[96,121,44],[97,111,22],[97,115,0],[97,172,45],[98,100,3],[98,107,3],[98,122,46],[99,101,24],[100,102,3],[100,123,47],[101,104,24],[102,105,3],[102,124,48],[103,107,45],[103,121,2],[103,122,2],[103,170,45],[104,171,17],[106,112,4],[107,112,45],[108,191,20],[109,115,21],[113,114,2],[113,152,32],[114,154,33],[115,169,44],[115,191,0],[116,117,7],[117,150,30],[118,146,2],[118,150,30],[119,120,2],[119,163,42],[120,121,2],[120,165,43],[121,168,44],[122,123,2],[122,174,46],[123,124,2],[123,131,47],[124,177,48],[125,184,53],[126,185,54],[127,185,54],[128,129,36],[128,186,0],[129,130,36],[129,151,5],[129,153,5],[130,133,36],[130,157,1],[130,158,1],[131,174,5],[131,175,47],[131,177,5],[132,179,50],[133,134,36],[133,187,2],[135,136,10],[139,180,48],[140,183,52],[141,175,47],[141,189,0],[144,181,51],[145,149,29],[146,149,29],[147,149,1],[148,151,5],[148,155,34],[149,150,1],[151,157,35],[151,186,35],[152,154,1],[153,156,5],[153,158,37],[154,155,1],[155,157,1],[156,160,38],[157,187,35],[158,160,1],[160,161,1],[161,162,1],[162,164,1],[163,165,5],[163,166,42],[164,166,1],[165,167,43],[165,168,5],[166,167,1],[167,169,1],[167,191,43],[168,169,44],[168,170,5],[169,172,1],[170,172,45],[170,174,5],[172,173,1],[173,174,46],[173,175,1],[175,176,1],[176,177,48],[176,178,1],[178,179,1],[179,181,1],[180,182,6],[181,183,1],[183,184,1],[184,185,1],[185,188,1]];

/** Broadway & West 26th Street, where the start frame stands. */
export const START_NODE = 30;


export interface LatLng {
  lat: number;
  lng: number;
}

export type Side = "north" | "south" | "east" | "west";

/** One block leaving an intersection. */
export interface Link {
  edge: number;
  from: number;
  to: number;
  /** Degrees clockwise from true north. */
  bearing: number;
  length: number;
  street: string;
}

// Metres between nearby points: an equirectangular projection is exact to well
// under 0.1% at this scale.
const LAT0 = 40.75;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110_574;

// Manhattan's "north" (up the avenues) is ~29° east of true north.
const GRID_NORTH = 29;

export function latLng(node: number): LatLng {
  const [lat, lng] = NODES[node];
  return { lat, lng };
}

export function bearingBetween(a: LatLng, b: LatLng): number {
  const deg =
    (Math.atan2((b.lng - a.lng) * KX, (b.lat - a.lat) * KY) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function distanceBetween(a: LatLng, b: LatLng): number {
  return Math.hypot((b.lng - a.lng) * KX, (b.lat - a.lat) * KY);
}

/** Signed difference a − b, in (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

const LINKS: Link[][] = NODES.map(() => []);
EDGES.forEach(([a, b, name], edge) => {
  const street = NAMES[name];
  const length = distanceBetween(latLng(a), latLng(b));
  LINKS[a].push({ edge, from: a, to: b, bearing: bearingBetween(latLng(a), latLng(b)), length, street });
  LINKS[b].push({ edge, from: b, to: a, bearing: bearingBetween(latLng(b), latLng(a)), length, street });
});

/** The blocks leaving an intersection, in each direction you could walk. */
export function linksAt(node: number): Link[] {
  return LINKS[node];
}

/** The block from `from` to `to`, walked in that direction. */
export function link(from: number, to: number): Link {
  const found = LINKS[from].find((l) => l.to === to);
  if (!found) throw new Error(`No block from ${from} to ${to}`);
  return found;
}

/** The point `along` metres into a directed block. */
export function pointOn(l: Link, along: number): LatLng {
  const a = latLng(l.from);
  const b = latLng(l.to);
  const t = Math.max(0, Math.min(1, along / (l.length || 1)));
  return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
}

/** A street crossing `street` at an intersection, e.g. "West 27th Street".
 * Not one that just continues it under another name (West → East 27th). */
export function crossStreet(node: number, street: string): string | null {
  const along = LINKS[node].find((l) => l.street === street);
  const crosses = (l: Link) => {
    if (l.street === street) return false;
    if (!along) return true;
    const turn = Math.abs(angleDiff(l.bearing, along.bearing)) % 180;
    return turn > 30 && turn < 150;
  };
  return (LINKS[node].find(crosses) ?? LINKS[node].find((l) => l.street !== street))?.street ?? null;
}

/** Midpoint of a block, for location-biased lookups. */
export function midpoint(edge: number): LatLng {
  const [a, b] = EDGES[edge];
  const p = latLng(a);
  const q = latLng(b);
  return { lat: (p.lat + q.lat) / 2, lng: (p.lng + q.lng) / 2 };
}

/** "West 27th Street" → "W 27th St", "6th Avenue" → "6th Ave". */
export function shortStreet(name: string): string {
  return name
    .replace(/^West /, "W ")
    .replace(/^East /, "E ")
    .replace(/ Street$/, " St")
    .replace(/ Avenue$/, " Ave")
    .replace(/ Avenue South$/, " Ave S");
}

/** How a block's two sides are named: avenues by west/east, streets by north/south. */
export function sidesOf(edge: number): [Side, Side] {
  const [a, b] = EDGES[edge];
  const along = Math.abs(angleDiff(bearingBetween(latLng(a), latLng(b)), GRID_NORTH));
  const runsUptown = along < 45 || along > 135;
  return runsUptown ? ["west", "east"] : ["north", "south"];
}

/** Which named side of the block is on your left and right, walking this way. */
export function leftRight(l: Link): { left: Side; right: Side } {
  const [first] = sidesOf(l.edge);
  if (first === "west") {
    const uptown = Math.abs(angleDiff(l.bearing, GRID_NORTH)) < 90;
    return uptown ? { left: "west", right: "east" } : { left: "east", right: "west" };
  }
  const westward = Math.abs(angleDiff(l.bearing, GRID_NORTH + 270)) < 90;
  return westward ? { left: "south", right: "north" } : { left: "north", right: "south" };
}

/** The block heading up Broadway from the start frame's corner. */
export const START_LINK: Link = linksAt(START_NODE)
  .filter((l) => l.street === "Broadway")
  .reduce((best, l) =>
    Math.abs(angleDiff(l.bearing, GRID_NORTH)) < Math.abs(angleDiff(best.bearing, GRID_NORTH)) ? l : best,
  );

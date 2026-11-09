# Ireland's closed railways: who they served, who they'd serve now

These are rough, order-of-magnitude estimates. Every figure is labelled as sourced, computed from the map data, or assumed. Scripts: `analysis/classify-towns.mjs` and `analysis/estimate.mjs`.

## Then (around 1911)

| | Figure | Source |
|---|---|---|
| Route length open, 1911 | 3,402 miles (5,475 km) | HMSO, *Report on the Banking, Railway and Shipping Statistics of Ireland for 1913* (1914), https://archive.org/details/op1256502-1001 |
| Route length on this map, 1920 | 5,480 km | Computed from OpenHistoricalMap. It agrees with the line above. |
| Stations, 1916 | 964 (the same page gives "over 3,500 miles" of line in 1916) | CSO, https://www.cso.ie/en/releasesandpublications/ep/p-1916/1916irl/economy/tp/ |
| Passenger journeys, 1911 | 30.8 million (30,814,837, plus 11,399 season tickets) | HMSO report as above. Hansard, 19 Jun 1913, gives 29.2 million and about 11,600 season tickets for 1912: https://api.parliament.uk/historic-hansard/written_answers/1913/jun/19/railway-season-ticket-holders-united |
| Goods and minerals, 1912 | about 6.7 million tons, not counting livestock | HMSO report as above (merchandise 2.27m + minerals 4.43m tons). The scan's columns are hard to read, so check the page image before quoting exact figures. |
| Island population, 1911 | 4.39 million | 1911 census |
| Journeys per person | about 7 a year | Computed |

The lines that later closed made up about two-thirds of the 1920 network (3,676 of 5,480 km, computed). They were mostly branch lines and probably carried a much smaller share of passengers. I'd guess 15–25%, or roughly 5–8 million journeys a year. That is an assumption: no island-wide split by line survives in the sources found.

Livestock was a major traffic too, though the report gives it only as receipts, with no head counts.

The closures came mostly in the 1950s–60s (computed from the map: 1,116 km in the 1950s, 1,324 km in the 1960s). The causes were road competition from about 1914, rising losses (CIÉ lost about £2.6m in the year to March 1958, by its annual report as reported in Irish Railfans' News, Jan 1960: https://www.steamtrainsireland.com/storage/publications/irfn0601.pdf), the Beddy report (1957, in the Republic) and the Benson report (1963, for Northern Ireland's UTA), and Stormont ordering the GNR closures. The West Clare was losing about £23k a year by CIÉ's account when it shut in 1961; the West Cork line had accumulated losses of over £50,000 (Irish Times).

## Now: who lives along the closed lines

Computed by measuring each OSM town and village (2021/22 census populations) to the nearest open and closed line on the map, with 3 km counting as "on the line".

| | Places | People (today) |
|---|---|---|
| Near a line still in use | 387 | about 3.1 million (towns with known population only) |
| Near only a closed line | 469 | about 0.8 million |
| Commuter belts (Dublin, Belfast, Cork, Derry, etc.) | 111 | about 0.3 million |
| Regional | 358 | about 0.6 million |

Notes:
- Villages with no population in OSM are assumed to have 550 people (the median of tagged villages). Towns with none are assumed to have 2,500.
- Navan is added back: its line carries Tara Mines freight only, with no passengers since 1958.
- Rathfarnham is taken out: its old line is now the Luas Green Line.
- As a sanity check, the All-Island Strategic Rail Review (Arup, for the two transport departments, 2024) says that, if all its recommendations were delivered, about 700,000 more people would live within 5 km of a station (Irish Times, 31 Jul 2024).

Largest towns that lost rail (2021/22 population, distance to the nearest open line):

| Town | Population | Line closed | Nearest open line |
|---|---|---|---|
| Navan | 33,886 | 1958 | track still used by freight only |
| Letterkenny | 22,549 | 1947 | 28 km |
| Omagh | 21,297 | 1965 | 44 km |
| Carrigaline | 18,239 | 1932 | 6 km |
| Strabane | 16,670 | 1965 | 21 km |
| Banbridge | 16,653 | 1955 | 6 km |
| Dundonald | 16,098 | 1950 | 4 km |
| Dungannon | 15,889 | 1965 | 23 km |
| Armagh | 14,590 | 1957 | 16 km |
| Enniskillen | 13,757 | 1957 | 54 km |

Northern Ireland lost proportionally more. Its whole west (Fermanagh, Tyrone, Armagh city) has no railway.

## If they were all running today: passengers

I calibrated against real regional stations. Boardings from the NTA National Rail Census 2024 (a one-day count), multiplied by 300 days and divided by town population, give these boardings per resident per year (https://www.nationaltransport.ie/publications/nta-national-rail-census-report-2024/):

- Enniscorthy 1.5, Wexford 2.2
- Ballina 3.6, Waterford 4.1
- Ennis 5.0, Castlebar 5.5, Tralee 5.6
- Gort 7.8, Sligo 9.8, Mullingar 9.8

Westport, Killarney and Athlone are higher because of tourism and interchange traffic. I used 2 / 5 / 10 for regional towns. For commuter belts I assumed 10 / 20 / 40. Each boarding is doubled to count the return leg.

| Scenario | Journeys per year | Of which commuter belts |
|---|---|---|
| Low | about 8 million | 5.6 million |
| Central | about 17 million | 11.2 million |
| High | about 34 million | 22.4 million |

For scale, the island carries about 65–70 million rail journeys a year today: Iarnród Éireann 55.0 million (2025, NTA) and NI Railways 15.1 million (2019-20, DfI). The central case adds about 25%. It would also be roughly two to three times what those lines probably carried in 1911, mainly because commuter towns like Navan, Carrigaline and Banbridge have grown so much.

Cautions:
- The Ennis–Athenry reopening (2010) has carried far less than hoped: about 133,000 journeys in 2017, roughly half the 250,000 a campaign against extending it cites as the forecast (the 2010 business case was reported as 100,000, so the forecast itself is disputed). Infrequent, slow services land at the low end.
- Scotland's Borders Railway hit 98% of its forecast in year 1 (1,267,599 against 1,294,272) with a frequent service (Transport Scotland). Service quality drives the outcome more than the track does.

## Congestion

The Borders Railway evaluation (Transport Scotland, year 1) found about 36% of surveyed trips were new, and 57% of people who switched mode had previously driven the whole way. So about 37% of rail journeys replace a car-driver trip.

| Scenario | Car trips replaced per year | Per weekday |
|---|---|---|
| Low | 2.9 million | about 10,000 |
| Central | 6.3 million | about 21,000 |
| High | 12.5 million | about 42,000 |

The effect would be local:
- It helps on specific corridors: N3/M3 Navan–Dublin, east Belfast (Comber, Dundonald), A1 Banbridge, N28 Carrigaline–Cork, and Derry–Strabane–Letterkenny.
- It wouldn't fix city congestion on its own. Dublin loses 191 hours per driver per year at rush hour, Cork 107 and Belfast 102 (TomTom 2025), and most of that is trips within the city.
- 63% of people commuting to work go by car: 59% driving and 4% as passengers (Census 2022).
- Congestion in the Greater Dublin Area costs an estimated €336m (2022), rising above €1.5bn by 2040 (Dept of Transport, Dec 2023). That covers all traffic, so the share rail could remove isn't separable from the sources found.

## Freight

| | Rail | Road |
|---|---|---|
| ROI tonnes | 0.34 million (2023) | 165 million (2024) |
| ROI tonne-km | 76 million (2023) | 13,575 million (2024) |
| Rail share | about 0.6% of tonne-km (computed) | |
| NI | none | 49 million tonnes lifted (2016) |
| 1912, all rail, for comparison | about 6.7 million tons plus livestock | |

Reopening the old branch lines wouldn't bring freight back by itself. Freight follows ports, inland terminals and track access charges, and most Irish road freight goes short distances.

Illustrative scenario (my assumptions, not a forecast): suppose rail won back 2–5% of road tonnage, 3–8 million tonnes a year. That is back to roughly 1912 levels.
- At an average of 20 tonnes per loaded HGV, that is about 150,000–400,000 lorry trips a year, or 500–1,300 per weekday.
- A GB intermodal train replaces about 75 HGVs. Irish trains are shorter, so allow about 35, which works out at about 15–40 freight trains a day island-wide.
- Rail emits about 76% less CO2 per tonne than road (a UK rail-freight industry figure, GB Railfreight; diesel rail in Great Britain, not Ireland).

This is meaningful on port corridors (Dublin Port, Waterford, Foynes, Belfast), but small against total road freight.

## The main uncertainties

1. Town populations are today's, from OSM census tags. A village with no tag gets an assumed value, and "within 3 km of a line" is not the same as "near a station".
2. Ridership rates assume a decent, regular service, as on today's regional lines. A token service performs at or below the low case.
3. The 1911 traffic split between later-closed lines and surviving lines is a guess.
4. Some figures come from press reports rather than primary sources. Check them before quoting them.

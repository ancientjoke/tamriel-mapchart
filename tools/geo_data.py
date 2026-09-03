# -*- coding: utf-8 -*-
"""
Hand-authored geography for the Tamriel map chart.

Coordinate space: SVG user units, viewBox "0 0 1240 790".
x increases east, y increases south.  The silhouette is traced from the
canonical Tamriel provincial map (the same base MapChart's Tamriel map uses),
with city anchors used as calibration points.

Every ring is listed CLOCKWISE in screen coordinates (land on the right when
walking forward).  Rings are closed implicitly.
"""

CANVAS = (1240, 790)

# ---------------------------------------------------------------------------
# The mainland: High Rock -> Skyrim -> Morrowind -> Black Marsh -> Elsweyr ->
# Valenwood -> Hammerfell, walked clockwise from the north-west cape.
# ---------------------------------------------------------------------------
MAINLAND = [
    # --- High Rock, north coast (Sea of Ghosts), W -> E
    (96, 110), (103, 94), (115, 82), (132, 72), (152, 64), (174, 58),
    (196, 52), (218, 46), (238, 42), (254, 49), (268, 57), (281, 50),
    (295, 42), (311, 38), (327, 40), (343, 38), (357, 42),
    # --- Skyrim, north coast: the Haafingar bay, Dawnstar, Winterhold
    (371, 36), (384, 29), (397, 24), (410, 28), (421, 38), (433, 47),
    (445, 43), (454, 33), (466, 25), (480, 20), (496, 17), (512, 21),
    (526, 29), (540, 25), (551, 31), (565, 25), (579, 19), (595, 15),
    (611, 17), (625, 23), (637, 19), (651, 25), (664, 33), (677, 29),
    (688, 37),
    # --- Morrowind, west arm: north coast, then down the Inner Sea's west shore
    (699, 45), (710, 54), (722, 60), (734, 68), (742, 80),
    (750, 92), (760, 104), (770, 116), (776, 130), (780, 146), (782, 164),
    (782, 182), (784, 200), (788, 220), (794, 240), (802, 256), (812, 270),
    (826, 280),
    # --- Inner Sea, south shore (the northern edge of the Deshaan), W -> E
    (846, 284), (866, 288), (886, 289), (906, 287), (924, 282), (940, 275),
    (952, 266),
    # --- Inner Sea, east shore / Telvanni peninsula west coast, S -> N
    (964, 252), (972, 238), (980, 222), (986, 206), (990, 190),
    (992, 172), (990, 152), (988, 132), (988, 112), (992, 92),
    # --- Telvanni peninsula, northern tip
    (1000, 76), (1012, 64), (1028, 60), (1042, 66), (1052, 78), (1056, 94),
    # --- Padomaic (east) coast of Morrowind, N -> S
    (1054, 110), (1050, 128), (1048, 148), (1047, 170), (1046, 192),
    (1050, 214), (1054, 236), (1053, 256), (1048, 276), (1042, 296),
    (1034, 316), (1026, 336), (1018, 356), (1010, 376), (1002, 394),
    (994, 412), (985, 430), (974, 448), (962, 464), (948, 478), (934, 490),
    (918, 500), (904, 508),
    # --- Black Marsh, east coast (Padomaic)
    (894, 520), (887, 536), (884, 552), (888, 568), (896, 582), (904, 596),
    (911, 612), (916, 628), (921, 646), (924, 662), (919, 678), (909, 690),
    (894, 698), (876, 704), (858, 708), (840, 710), (822, 710), (804, 708),
    (786, 710), (768, 712), (750, 714),
    # --- Topal Bay / Niben inlet: east bank, S -> N
    (732, 714), (716, 712), (706, 706), (702, 688), (699, 670), (696, 652),
    (693, 634), (690, 616), (688, 598), (686, 580), (684, 562), (682, 544),
    (680, 526), (678, 508), (676, 490), (674, 472), (671, 454), (666, 436),
    (659, 422), (651, 414), (644, 410),
    # --- head of Niben Bay, then back down the west bank, N -> S
    (636, 412), (630, 420), (626, 433), (627, 449), (629, 467), (631, 485),
    (633, 503), (634, 521), (635, 539), (634, 557), (632, 575), (629, 593),
    (626, 611), (623, 629), (620, 647), (618, 665), (617, 683), (617, 701),
    (620, 714),
    # --- Elsweyr, south coast (Topal Bay shore), E -> W
    (604, 716), (588, 714), (572, 712), (556, 710), (540, 712), (524, 716),
    # --- Valenwood, south coast
    (508, 718), (492, 718), (476, 715), (460, 711), (444, 706), (430, 704),
    (422, 706), (406, 710), (390, 714), (374, 714), (358, 710), (344, 702),
    (332, 690), (324, 676), (318, 662),
    # --- Valenwood, west coast (Eltheric Ocean), S -> N
    (314, 646), (310, 630), (304, 614), (296, 600), (290, 584), (288, 568),
    (292, 552), (298, 538), (302, 522), (304, 506), (310, 492), (318, 480),
    (328, 470), (340, 464), (352, 460),
    # --- Cyrodiil, the Gold Coast (Abecean Sea)
    (362, 452), (372, 442), (378, 430), (378, 416), (372, 404), (364, 396),
    # --- Hammerfell, south coast, E -> W
    (350, 392), (336, 388), (322, 378), (310, 366), (298, 354), (286, 348),
    (272, 346), (258, 348), (244, 350), (230, 348), (216, 350), (202, 356),
    (188, 362), (174, 364),
    # --- Cape Shira (the Hegathe peninsula)
    (162, 362), (152, 356), (146, 346), (149, 334), (156, 326),
    # --- Hammerfell, west coast, S -> N
    (150, 316), (140, 308), (128, 304), (116, 306), (107, 312), (100, 300),
    (96, 288), (99, 280),
    # --- Iliac Bay, south shore, W -> E
    (105, 272), (121, 268), (137, 266), (153, 266), (169, 268), (185, 272),
    (201, 274), (215, 272), (226, 266),
    # --- head of the Iliac Bay, then its north shore, E -> W
    (234, 258), (228, 248), (216, 241), (202, 237), (188, 235), (174, 234),
    (160, 232), (146, 228), (132, 224), (118, 218), (106, 212),
    # --- High Rock, the Daggerfall peninsula: down its eastern side...
    (100, 220), (92, 236), (84, 252), (76, 266), (70, 278), (60, 282),
    # --- ...and back up its west coast, then north to close the ring
    (52, 270), (48, 254), (50, 238), (56, 222), (64, 208), (72, 194),
    (78, 180), (82, 164), (84, 148), (86, 132), (90, 118),
]

# ---------------------------------------------------------------------------
# Islands.  name -> ring
# ---------------------------------------------------------------------------
ISLANDS = {
    "vvardenfell": [
        (866, 66), (884, 70), (900, 76), (912, 86), (922, 98), (932, 108),
        (940, 122), (944, 138), (942, 156), (946, 172), (942, 190),
        (934, 206), (922, 220), (908, 232), (892, 242), (876, 250),
        (860, 256), (844, 254), (830, 246), (818, 236), (810, 224),
        (804, 210), (800, 194), (798, 176), (800, 158), (802, 140),
        (806, 124), (812, 108), (820, 94), (832, 82), (848, 72),
    ],
    "sadrith_mora": [
        (966, 165), (977, 170), (980, 181), (973, 191), (960, 191),
        (953, 182), (956, 170),
    ],
    "solstheim": [
        (744, 4), (760, 8), (770, 18), (772, 32), (766, 44), (752, 50),
        (736, 48), (726, 38), (724, 24), (732, 10),
    ],
    "sheogorad_a": [(896, 46), (908, 50), (912, 60), (904, 66), (892, 62), (888, 52)],
    "sheogorad_b": [(922, 70), (934, 74), (936, 84), (928, 90), (918, 84), (916, 74)],
    "sheogorad_c": [(946, 60), (956, 64), (956, 74), (946, 76), (940, 68)],
    "roscrea": [
        (1096, 34), (1114, 40), (1122, 54), (1116, 68), (1100, 74),
        (1084, 68), (1078, 54), (1084, 40),
    ],
    "roscrea_b": [(1138, 78), (1150, 84), (1152, 96), (1142, 102), (1130, 96), (1128, 84)],
    "padomaic_islet": [(1104, 122), (1116, 128), (1114, 140), (1102, 142), (1096, 132)],
    "stros_mkai": [
        (176, 386), (192, 392), (199, 405), (194, 419), (180, 426),
        (164, 422), (156, 409), (162, 394),
    ],
    "cespar": [(134, 380), (146, 384), (148, 395), (138, 400), (128, 394), (127, 385)],
    "herne": [(200, 436), (213, 441), (215, 453), (204, 459), (192, 453), (191, 442)],
    "betony": [(136, 236), (150, 241), (152, 253), (141, 259), (129, 253), (127, 242)],
    "stirk": [(330, 434), (341, 439), (341, 450), (330, 454), (321, 447), (322, 438)],
    "summerset": [
        (140, 522), (162, 528), (178, 540), (190, 556), (196, 574),
        (200, 592), (208, 610), (216, 628), (220, 648), (218, 668),
        (208, 686), (194, 700), (176, 710), (156, 714), (136, 712),
        (118, 704), (102, 694), (88, 682), (76, 668), (66, 652),
        (60, 634), (56, 616), (54, 596), (56, 576), (62, 558),
        (72, 544), (86, 532), (102, 526), (120, 522),
    ],
    "auridon": [
        (204, 484), (222, 488), (238, 498), (250, 512), (259, 528),
        (266, 544), (271, 562), (274, 580), (273, 598), (266, 614),
        (254, 622), (241, 618), (230, 606), (220, 592), (210, 576),
        (202, 560), (195, 544), (190, 528), (189, 508), (195, 492),
    ],
    "artaeum": [(30, 496), (43, 501), (46, 513), (36, 521), (23, 516), (20, 504)],
    "khenarthis_roost": [
        (586, 742), (606, 746), (618, 756), (616, 770), (600, 778),
        (580, 776), (568, 766), (570, 750),
    ],
    "topal_islet": [(658, 664), (668, 668), (667, 678), (657, 681), (650, 673)],
}

# Islands with no region seed of their own: drawn as scenery only.
SCENERY_ISLANDS = {
    "sheogorad_a", "sheogorad_b", "sheogorad_c", "roscrea", "roscrea_b",
    "padomaic_islet", "cespar", "stirk", "topal_islet", "solstheim_scenery",
}

# ---------------------------------------------------------------------------
# Decorative inland water drawn ON TOP of the regions (lakes + big rivers).
# These do not affect region geometry, exactly like the reference chart.
# ---------------------------------------------------------------------------
LAKES = [
    # Lake Rumare, ringing the Imperial City
    [(612, 384), (628, 378), (640, 366), (641, 352), (632, 341), (616, 336),
     (600, 337), (588, 344), (583, 356), (588, 370), (598, 380)],
    # Lake Ilinalta (Falkreath)
    [(497, 191), (509, 189), (517, 196), (514, 206), (502, 209), (492, 203),
     (490, 195)],
    # Lake Honrich (the Rift)
    [(676, 214), (687, 213), (693, 221), (688, 229), (676, 230), (669, 223)],
    # Lake Vurunhil / Bangkorai
    [(292, 214), (303, 213), (308, 220), (302, 227), (291, 227), (286, 220)],
    # Lake Canulus (Cyrodiil, Nibenay)
    [(654, 350), (664, 348), (669, 356), (663, 363), (653, 362), (649, 355)],
    # Sea of Pearls inlet, Black Marsh
    [(866, 604), (878, 600), (887, 606), (884, 617), (871, 620), (862, 613)],
]

RIVERS = [
    # Karth (Skyrim, W) -> Sea of Ghosts
    [(430, 168), (426, 140), (432, 112), (441, 84), (447, 56), (452, 40)],
    # Niben headwaters -> Lake Rumare
    [(604, 300), (601, 318), (600, 336)],
    # Rumare -> Niben Bay
    [(641, 366), (648, 382), (646, 396), (644, 410)],
    # Brena (Cyrodiil / Hammerfell border)
    [(392, 330), (382, 348), (372, 368), (364, 396)],
    # Strid (Cyrodiil / Valenwood border)
    [(452, 452), (430, 470), (404, 486), (378, 496), (352, 500), (326, 500),
     (306, 504)],
    # Xylo (Elsweyr / Valenwood)
    [(556, 620), (560, 648), (556, 676), (546, 700), (534, 716)],
    # Onkobra (Black Marsh)
    [(872, 512), (879, 540), (881, 570), (879, 598), (877, 620)],
    # Thir (Morrowind, Deshaan)
    [(876, 300), (884, 330), (894, 360), (910, 388), (930, 412)],
    # Reed / Argonian delta
    [(742, 596), (730, 626), (720, 656), (712, 684), (706, 706)],
    # Bjoulsae (High Rock -> Iliac Bay)
    [(300, 196), (282, 206), (266, 218), (250, 234), (234, 258)],
]

# ---------------------------------------------------------------------------
# Region seeds.  (name, province, x, y, city|None)
# The Voronoi tessellation of these seeds, clipped to the coastline and with
# fractal-perturbed shared edges, produces the region polygons.
# ---------------------------------------------------------------------------
SEEDS = [
    # ================= HIGH ROCK =================
    ("Northpoint",        "High Rock", 240,  62, "Northpoint"),
    ("Urvaius",           "High Rock", 272,  70, None),
    ("Farrun",            "High Rock", 330,  55, "Farrun"),
    ("Jehanna",           "High Rock", 370,  80, "Jehanna"),
    ("Dwynnen",           "High Rock", 283,  92, None),
    ("Northmoor",         "High Rock", 302, 124, None),
    ("Ykalon",            "High Rock", 258, 108, None),
    ("Phrygias",          "High Rock", 228, 138, None),
    ("Shornhelm",         "High Rock", 200, 118, "Shornhelm"),
    ("Wrothgar",          "High Rock", 325, 152, "Orsinium"),
    ("Evermore",          "High Rock", 289, 168, "Evermore"),
    ("Bangkorai",         "High Rock", 298, 214, None),
    ("Menevia",           "High Rock", 252, 202, None),
    ("Wayrest",           "High Rock", 224, 230, "Wayrest"),
    ("Alcaire",           "High Rock", 206, 192, None),
    ("Kambria",           "High Rock", 180, 166, None),
    ("Glenpoint",         "High Rock", 150, 122, None),
    ("Glenumbra Moors",   "High Rock", 100, 150, None),
    ("Camlorn",           "High Rock", 110, 188, "Camlorn"),
    ("Daenia",            "High Rock", 133, 158, None),
    ("Ilessan Hills",     "High Rock", 168, 206, None),
    ("Daggerfall",        "High Rock",  78, 222, "Daggerfall"),
    ("Anticlere",         "High Rock", 128, 196, None),
    ("Betony",            "High Rock", 140, 247, "Betony"),

    # ================= HAMMERFELL =================
    ("Sentinel",          "Hammerfell", 140, 282, "Sentinel"),
    ("Bergama",           "Hammerfell", 226, 290, None),
    ("Alik'r Desert",     "Hammerfell", 280, 255, None),
    ("Myrkwasa",          "Hammerfell", 172, 300, None),
    ("Antiphyllos",       "Hammerfell", 212, 308, None),
    ("Santaki",           "Hammerfell", 250, 296, None),
    ("Tigonus",           "Hammerfell", 300, 250, None),
    ("Khefrem",           "Hammerfell", 248, 330, None),
    ("Gilane",            "Hammerfell", 224, 332, "Gilane"),
    ("Abibon-Gora",       "Hammerfell", 188, 334, None),
    ("Hegathe",           "Hammerfell", 156, 344, "Hegathe"),
    ("Taneth",            "Hammerfell", 295, 330, "Taneth"),
    ("Dak'fron",          "Hammerfell", 288, 296, None),
    ("Totambu",           "Hammerfell", 318, 268, None),
    ("Lainlyn",           "Hammerfell", 332, 308, "Lainlyn"),
    ("Goldmoor",          "Hammerfell", 364, 302, None),
    ("Rihad",             "Hammerfell", 348, 368, "Rihad"),
    ("Satakalaam",        "Hammerfell", 350, 246, None),
    ("Skaven",            "Hammerfell", 318, 220, "Skaven"),
    ("Dragonstar",        "Hammerfell", 376, 172, "Dragonstar"),
    ("Dragontail Mountains", "Hammerfell", 404, 240, None),
    ("Craglorn",          "Hammerfell", 436, 214, None),
    ("Elinhir",           "Hammerfell", 462, 244, "Elinhir"),
    ("Stros M'Kai",       "Hammerfell", 177, 406, "Stros M'Kai"),
    ("Herne",             "Hammerfell", 203, 447, None),

    # ================= SKYRIM =================
    ("Haafingar",         "Skyrim", 458,  58, "Solitude"),
    ("Hjaalmarch",        "Skyrim", 492,  95, "Morthal"),
    ("The Pale",          "Skyrim", 556,  68, "Dawnstar"),
    ("Winterhold",        "Skyrim", 636,  55, "Winterhold"),
    ("Hsaarik Head",      "Skyrim", 690,  45, None),
    ("Eastmarch",         "Skyrim", 650, 112, "Windhelm"),
    ("Whitewatch",        "Skyrim", 556, 122, None),
    ("Whiterun Hold",     "Skyrim", 540, 158, "Whiterun"),
    ("Throat of the World", "Skyrim", 578, 182, None),
    ("Riftweald",         "Skyrim", 636, 188, None),
    ("The Rift",          "Skyrim", 688, 200, "Riften"),
    ("Velothi Pass",      "Skyrim", 676, 155, None),
    ("Falkreath Hold",    "Skyrim", 505, 212, "Falkreath"),
    ("Rorikstead Plains", "Skyrim", 486, 158, None),
    ("Karthald",          "Skyrim", 430, 178, None),
    ("The Reach",         "Skyrim", 400, 140, "Markarth"),
    ("Druadach Highlands","Skyrim", 415, 105, None),

    # ================= CYRODIIL =================
    ("Bruma",             "Cyrodiil", 575, 258, "Bruma"),
    ("Jerall Mountains",  "Cyrodiil", 540, 240, None),
    ("Colovian Highlands","Cyrodiil", 462, 272, None),
    ("Chorrol",           "Cyrodiil", 487, 308, "Chorrol"),
    ("Great Forest",      "Cyrodiil", 522, 322, None),
    ("Heartlands",        "Cyrodiil", 586, 318, None),
    ("Imperial City",     "Cyrodiil", 610, 356, "Imperial City"),
    ("Cheydinhal",        "Cyrodiil", 700, 300, "Cheydinhal"),
    ("Valus Mountains",   "Cyrodiil", 736, 348, None),
    ("Nibenay Basin",     "Cyrodiil", 648, 398, None),
    ("Nibenay Valley",    "Cyrodiil", 612, 452, "Bravil"),
    ("West Weald",        "Cyrodiil", 487, 425, "Skingrad"),
    ("Kvatch",            "Cyrodiil", 424, 428, "Kvatch"),
    ("Gold Coast",        "Cyrodiil", 392, 452, "Anvil"),
    ("Blackwood",         "Cyrodiil", 736, 500, None),
    ("Leyawiin",          "Cyrodiil", 618, 566, "Leyawiin"),
    ("Strident Coast",    "Cyrodiil", 592, 648, None),

    # ================= MORROWIND =================
    ("Sheogorad",         "Morrowind", 872, 84, "Dagon Fel"),
    ("West Gash",         "Morrowind", 816, 122, "Gnisis"),
    ("Ashlands",          "Morrowind", 858, 126, "Ald'ruhn"),
    ("Red Mountain",      "Morrowind", 886, 162, None),
    ("Grazelands",        "Morrowind", 918, 144, "Vos"),
    ("Azura's Coast",     "Morrowind", 922, 196, "Tel Aruhn"),
    ("Molag Amur",        "Morrowind", 884, 210, "Molag Mar"),
    ("Ascadian Isles",    "Morrowind", 858, 236, "Vivec"),
    ("Bitter Coast",      "Morrowind", 824, 206, "Balmora"),
    ("Sadrith Mora",      "Morrowind", 966, 180, "Sadrith Mora"),
    ("Solstheim",         "Morrowind", 748,  27, "Raven Rock"),
    ("Blacklight",        "Morrowind", 716, 100, "Blacklight"),
    ("Velothi Mountains", "Morrowind", 726, 158, None),
    ("Redoran March",     "Morrowind", 736, 200, None),
    ("Stonefalls",        "Morrowind", 748, 240, "Ebonheart"),
    ("Bal Foyen",         "Morrowind", 766, 262, None),
    ("Kragenmoor",        "Morrowind", 796, 304, "Kragenmoor"),
    ("Deshaan",           "Morrowind", 846, 320, None),
    ("Mournhold",         "Morrowind", 902, 338, "Mournhold"),
    ("Narsis",            "Morrowind", 868, 382, "Narsis"),
    ("Dres March",        "Morrowind", 932, 398, None),
    ("Tear",              "Morrowind", 958, 438, "Tear"),
    ("Necrom",            "Morrowind", 1040, 258, "Necrom"),
    ("Telvanni Peninsula","Morrowind", 1022, 212, None),
    ("Firewatch",         "Morrowind", 1022, 168, "Firewatch"),
    ("Port Telvannis",    "Morrowind", 1024, 100, "Port Telvannis"),

    # ================= BLACK MARSH =================
    ("Rockguard",         "Black Marsh", 850, 434, None),
    ("Shadowfen",         "Black Marsh", 858, 470, "Stormhold"),
    ("Thornmarsh",        "Black Marsh", 900, 492, "Thorn"),
    ("Arnesia",           "Black Marsh", 826, 512, None),
    ("Onkobra",           "Black Marsh", 872, 548, None),
    ("Helstrom",          "Black Marsh", 852, 588, "Helstrom"),
    ("Archon",            "Black Marsh", 900, 632, "Archon"),
    ("Xanmeer Vale",      "Black Marsh", 890, 600, None),
    ("Murkmire",          "Black Marsh", 872, 674, "Lilmoth"),
    ("Blackrose",         "Black Marsh", 830, 650, "Blackrose"),
    ("Soulrest",          "Black Marsh", 790, 672, "Soulrest"),
    ("Alten Corimont",    "Black Marsh", 796, 614, None),
    ("Gideon",            "Black Marsh", 762, 578, "Gideon"),
    ("Hist Groves",       "Black Marsh", 800, 552, None),

    # ================= ELSWEYR =================
    ("Riverhold",         "Elsweyr", 566, 474, "Riverhold"),
    ("Dune",              "Elsweyr", 518, 494, "Dune"),
    ("Anequina Plains",   "Elsweyr", 548, 536, None),
    ("Orcrest",           "Elsweyr", 580, 520, "Orcrest"),
    ("Rimmen",            "Elsweyr", 620, 508, "Rimmen"),
    ("Helkori Wastes",    "Elsweyr", 604, 552, None),
    ("Tenmar Forest",     "Elsweyr", 556, 588, None),
    ("Corinthe",          "Elsweyr", 592, 600, "Corinthe"),
    ("Alabaster",         "Elsweyr", 612, 614, None),
    ("Torval",            "Elsweyr", 548, 646, "Torval"),
    ("Senchal",           "Elsweyr", 598, 692, "Senchal"),
    ("Khenarthi's Roost", "Elsweyr", 594, 760, "Mistral"),

    # ================= VALENWOOD =================
    ("Arenthia",          "Valenwood", 476, 470, "Arenthia"),
    ("Reaper's March",    "Valenwood", 498, 528, None),
    ("Falinesti",         "Valenwood", 404, 510, "Falinesti"),
    ("Malabal Tor",       "Valenwood", 350, 520, "Vulkwasten"),
    ("Silvenar",          "Valenwood", 434, 548, "Silvenar"),
    ("Grahtwood",         "Valenwood", 472, 590, "Marbruk"),
    ("Elden Root",        "Valenwood", 444, 616, "Elden Root"),
    ("Greenshade",        "Valenwood", 352, 570, None),
    ("Woodhearth",        "Valenwood", 320, 604, "Woodhearth"),
    ("Greenheart",        "Valenwood", 378, 634, "Greenheart"),
    ("Southpoint",        "Valenwood", 452, 678, "Southpoint"),
    ("Haven",             "Valenwood", 512, 664, "Haven"),
    ("Xylo Delta",        "Valenwood", 544, 700, None),

    # ================= SUMMERSET ISLES =================
    ("Cloudrest",         "Summerset Isles", 140, 572, "Cloudrest"),
    ("Lillandril",        "Summerset Isles",  78, 588, "Lillandril"),
    ("Shimmerene",        "Summerset Isles", 180, 622, "Shimmerene"),
    ("Corgrad Wastes",    "Summerset Isles", 112, 626, None),
    ("Alinor",            "Summerset Isles",  94, 662, "Alinor"),
    ("Sunhold",           "Summerset Isles", 148, 690, "Sunhold"),
    ("Dusk",              "Summerset Isles", 196, 678, "Dusk"),
    ("Firsthold",         "Summerset Isles", 212, 508, "Firsthold"),
    ("Skywatch",          "Summerset Isles", 240, 552, "Skywatch"),
    ("Vulkhel Guard",     "Summerset Isles", 254, 598, "Vulkhel Guard"),
    ("Artaeum",           "Summerset Isles",  33, 508, None),
]

PROVINCE_ORDER = [
    "High Rock", "Hammerfell", "Skyrim", "Cyrodiil", "Morrowind",
    "Black Marsh", "Elsweyr", "Valenwood", "Summerset Isles",
]

# Sea crossings that are too wide for the automatic proximity test but that
# history (and the simulation) treats as connected.
MANUAL_SEA_LINKS = [
    ("Artaeum", "Lillandril"),
    ("Artaeum", "Cloudrest"),
    ("Solstheim", "Sheogorad"),
    ("Solstheim", "Winterhold"),
    ("Solstheim", "Blacklight"),
    ("Khenarthi's Roost", "Senchal"),
    ("Khenarthi's Roost", "Xylo Delta"),
    ("Stros M'Kai", "Hegathe"),
    ("Stros M'Kai", "Herne"),
    ("Herne", "Abibon-Gora"),
    ("Betony", "Daggerfall"),
    ("Betony", "Sentinel"),
    ("Firsthold", "Cloudrest"),
    ("Firsthold", "Shimmerene"),
    ("Skywatch", "Shimmerene"),
    ("Vulkhel Guard", "Dusk"),
    ("Vulkhel Guard", "Woodhearth"),
    ("Sadrith Mora", "Azura's Coast"),
    ("Sadrith Mora", "Telvanni Peninsula"),
    ("Sadrith Mora", "Grazelands"),
    ("Ascadian Isles", "Bal Foyen"),
    ("Ascadian Isles", "Stonefalls"),
    ("Bitter Coast", "Stonefalls"),
    ("West Gash", "Blacklight"),
    ("West Gash", "Velothi Mountains"),
    ("Sheogorad", "Port Telvannis"),
]

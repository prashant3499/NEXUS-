#!/usr/bin/env python3
"""NEXUS customer + partner 'Join us' deck — warm Bazaar identity. python-pptx."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

# ---- warm Bazaar palette (distinct from the indigo founder deck) ----
INK    = RGBColor(0x2C,0x1A,0x10)
BROWN  = RGBColor(0x5A,0x2A,0x1A)   # dark surface (title/closing)
MADDER = RGBColor(0x8A,0x33,0x24)
MARI   = RGBColor(0xE0,0x77,0x2B)   # marigold accent (dominant accent)
LEAF   = RGBColor(0x5B,0x7B,0x43)
PAPER  = RGBColor(0xFF,0xFF,0xFF)
SOFT   = RGBColor(0xFB,0xF3,0xE8)   # warm tint, small accents only
INK2   = RGBColor(0x7A,0x54,0x40)
INK3   = RGBColor(0xA9,0x8A,0x74)
LINE   = RGBColor(0xEA,0xD9,0xC5)
WHITE  = RGBColor(0xFF,0xFF,0xFF)
CREAM  = RGBColor(0xF5,0xE6,0xD5)   # light text on brown

SERIF = "Century Schoolbook"   # friendly safe-list serif (display)
SANS  = "Calibri"

prs = Presentation(); prs.slide_width=Inches(13.333); prs.slide_height=Inches(7.5)
SW,SH=prs.slide_width,prs.slide_height; BLANK=prs.slide_layouts[6]

def slide(bg=PAPER):
    s=prs.slides.add_slide(BLANK)
    r=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,0,0,SW,SH)
    r.fill.solid(); r.fill.fore_color.rgb=bg; r.line.fill.background(); r.shadow.inherit=False
    return s

def box(s,x,y,w,h,text,size,color,*,bold=False,italic=False,font=SANS,align=PP_ALIGN.LEFT,
        anchor=MSO_ANCHOR.TOP,spacing=None,line_sp=1.0):
    tb=s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)); tf=tb.text_frame
    tf.word_wrap=True; tf.vertical_anchor=anchor
    tf.margin_left=0; tf.margin_right=0; tf.margin_top=0; tf.margin_bottom=0
    runs=text if isinstance(text,list) else [(text,{})]
    for i,(t,o) in enumerate(runs):
        p=tf.paragraphs[0] if i==0 else tf.add_paragraph()
        p.alignment=o.get("align",align); p.line_spacing=line_sp
        if o.get("space_after") is not None: p.space_after=Pt(o["space_after"])
        r=p.add_run(); r.text=t; f=r.font
        f.size=Pt(o.get("size",size)); f.name=o.get("font",font)
        f.bold=o.get("bold",bold); f.italic=o.get("italic",italic); f.color.rgb=o.get("color",color)
        sp=o.get("spacing",spacing)
        if sp is not None:
            rPr=r._r.get_or_add_rPr(); rPr.set("spc",str(int(sp*100)))
    return tb

def card(s,x,y,w,h,fill=WHITE,shadow=True):
    shp=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,Inches(x),Inches(y),Inches(w),Inches(h))
    shp.fill.solid(); shp.fill.fore_color.rgb=fill; shp.line.color.rgb=LINE; shp.line.width=Pt(0.75)
    try: shp.adjustments[0]=0.08
    except Exception: pass
    shp.shadow.inherit=False
    if shadow:
        spPr=shp._element.spPr; el=spPr.makeelement(qn('a:effectLst'),{}); spPr.append(el)
        o=el.makeelement(qn('a:outerShdw'),{'blurRad':'80000','dist':'30000','dir':'5400000','rotWithShape':'0'}); el.append(o)
        c=o.makeelement(qn('a:srgbClr'),{'val':'5A2A1A'}); o.append(c)
        a=c.makeelement(qn('a:alpha'),{'val':'11000'}); c.append(a)
    return shp

def circle(s,x,y,d,fill,glyph="",gcolor=WHITE,gsize=16):
    c=s.shapes.add_shape(MSO_SHAPE.OVAL,Inches(x),Inches(y),Inches(d),Inches(d))
    c.fill.solid(); c.fill.fore_color.rgb=fill; c.line.fill.background(); c.shadow.inherit=False
    if glyph:
        tf=c.text_frame; p=tf.paragraphs[0]; p.alignment=PP_ALIGN.CENTER
        r=p.add_run(); r.text=glyph; r.font.size=Pt(gsize); r.font.bold=True; r.font.color.rgb=gcolor; r.font.name=SANS
    return c

def eyebrow(s,x,y,text,color=MARI):
    box(s,x,y,7,0.3,text.upper(),12,color,bold=True,spacing=2.2)

# ===== 1. TITLE =====
s=slide(BROWN)
circle(s,0.9,0.85,0.5,MARI,"N",WHITE,20)
box(s,1.55,0.9,6,0.5,"NEXUS",19,WHITE,bold=True,font=SERIF,spacing=3)
box(s,0.9,2.4,11.5,2.0,[("Sell your craft to the world.\n",{"size":46,"bold":True,"color":WHITE,"font":SERIF}),
    ("Keep what you earn.",{"size":46,"bold":True,"color":MARI,"font":SERIF})],46,WHITE,font=SERIF,line_sp=1.05)
box(s,0.92,4.95,11,0.9,"No GST? No company? Can't read a form? You're exactly who we built this for. Speak your craft — we handle the rest, and most of the money stays with you.",
    16,CREAM,italic=True,font=SERIF,line_sp=1.25)
box(s,0.92,6.5,11,0.4,"JOIN NEXUS  ·  कारीगर से दुनिया तक  ·  आपकी भाषा में, आपके दाम पर",12,MARI,bold=True,spacing=1)

# ===== 2. WHO IT'S FOR =====
s=slide(PAPER)
eyebrow(s,0.9,0.7,"Who can join")
box(s,0.9,1.05,11.5,0.9,"If you make it by hand, there's a place for you here.",30,INK,bold=True,font=SERIF)
box(s,0.9,1.95,11.5,0.6,"Weavers, potters, jewellers, gem-cutters, leather workers, block-printers, and craft hosts — registered or not. One verified identity covers everything you make and do.",15,INK2,line_sp=1.15)
who=[("🧵","Weavers & printers"),("🏺","Potters & sculptors"),("💍","Jewellers"),
     ("💎","Gem cutters"),("👜","Leather & natural crafts"),("🎟️","Workshop & tour hosts")]
gx,gy,gw,gh=0.9,2.85,3.84,1.5
for i,(g,h) in enumerate(who):
    cx=gx+(i%3)*(gw+0.16); cy=gy+(i//3)*(gh+0.18)
    card(s,cx,cy,gw,gh)
    circle(s,cx+0.3,cy+0.42,0.66,SOFT,g,MARI,18)
    box(s,cx+1.12,cy+0.42,gw-1.3,0.7,h,16,INK,bold=True,font=SERIF,anchor=MSO_ANCHOR.MIDDLE)
box(s,0.9,6.15,11.5,0.5,"No GST, PAN, or company needed to start — the platform carries the paperwork for you.",14,LEAF,italic=True,font=SERIF)

# ===== 3. WHAT YOU CAN SELL (verticals/products) =====
s=slide(PAPER)
eyebrow(s,0.9,0.7,"What you can sell")
box(s,0.9,1.05,11.5,0.9,"Everything you craft — goods, services, and experiences.",30,INK,bold=True,font=SERIF)
cells=[("🏺","Handicraft","Pottery, brass, marble, wood — shipped with proof of who made it"),
       ("🧵","Textiles","Banarasi, ikat, Bagru natural-dye — GI-protected handloom"),
       ("💍","Jewellery","Kundan-meenakari, silver filigree — hallmarked & traceable"),
       ("💎","Gems","Lab-certified coloured stones, sold with the certificate"),
       ("🌿","Natural & sustainable","Vegetable-tanned, natural-dyed, eco-friendly craft"),
       ("🎟️","Experiences","Host a workshop or craft tour — earn from your skill, not just your goods")]
gx,gy,gw,gh=0.9,2.2,3.84,1.95
for i,(g,h,d) in enumerate(cells):
    cx=gx+(i%3)*(gw+0.16); cy=gy+(i//3)*(gh+0.2)
    card(s,cx,cy,gw,gh)
    circle(s,cx+0.28,cy+0.3,0.6,SOFT,g,MARI,17)
    box(s,cx+1.02,cy+0.32,gw-1.2,0.5,h,15,INK,bold=True,font=SERIF)
    box(s,cx+0.3,cy+0.95,gw-0.6,0.85,d,11.5,INK2,line_sp=1.12)

# ===== 4. WHY JOIN (maker benefits) =====
s=slide(PAPER)
eyebrow(s,0.9,0.7,"Why join")
box(s,0.9,1.05,7.2,0.9,"More of the money. Less of the hassle.",30,INK,bold=True,font=SERIF,line_sp=1.0)
bens=[("₹","You keep ~81%","On a ₹5,000 sale you get ₹4,067. The fee is 12% — not the 20–40% others take."),
      ("⚡","Paid in ~2 days","Money to your own bank account, fast — not weeks of waiting."),
      ("🗣","Sell in your language","List by voice in 13 Indian languages. No typing, no English, no forms."),
      ("🛡","Zero legal worry","We become the seller of record and carry the GST, tax and paperwork.")]
for i,(g,h,d) in enumerate(bens):
    cy=2.1+i*1.15
    circle(s,0.9,cy,0.7,MARI if i%2==0 else LEAF,g,WHITE,18)
    box(s,1.8,cy-0.04,4.0,0.7,h,18,INK,bold=True,font=SERIF,anchor=MSO_ANCHOR.MIDDLE)
    box(s,5.9,cy-0.04,6.5,0.9,d,13.5,INK2,line_sp=1.1,anchor=MSO_ANCHOR.MIDDLE)
box(s,0.9,6.9,11.5,0.4,"And the platform never runs at a loss — so it's built to last, and so are you.",13,LEAF,italic=True,font=SERIF)

# ===== 5. HOW IT WORKS =====
s=slide(BROWN)
eyebrow(s,0.9,0.7,"How it works",MARI)
box(s,0.9,1.05,11.5,0.9,"Three steps. We do the hard parts.",30,WHITE,bold=True,font=SERIF)
steps=[("1","Speak your craft","Tell us what you make — by voice, in your language. We write the listing and add your story."),
       ("2","We verify & handle papers","We confirm who you are (with your consent), check provenance, and carry the GST, tax and compliance."),
       ("3","You get paid","A buyer anywhere orders. The money lands in your bank in about two days — most of it yours.")]
for i,(n,h,d) in enumerate(steps):
    cx=0.9+i*4.05
    card(s,cx,2.3,3.8,3.5,RGBColor(0x6B,0x37,0x26))
    circle(s,cx+0.35,2.65,0.75,MARI,n,WHITE,22)
    box(s,cx+0.35,3.65,3.2,0.7,h,18,WHITE,bold=True,font=SERIF)
    box(s,cx+0.35,4.45,3.2,1.2,d,13,CREAM,line_sp=1.18)

# ===== 6. FEATURES FOR MAKERS =====
s=slide(PAPER)
eyebrow(s,0.9,0.7,"Your toolkit")
box(s,0.9,1.05,11.5,0.9,"Everything a maker needs, in one place.",30,INK,bold=True,font=SERIF)
feats=[("Voice & icon listing","List and manage your shop by speaking or tapping pictures — built for every literacy level."),
       ("Verified provenance","Your story and proof travel with every piece, so buyers trust it — and pay for it."),
       ("Fair, transparent pay","See exactly what you earn before you sell. No hidden cuts."),
       ("Scheme & welfare access","We surface the government schemes you qualify for, and help you onto e-Shram."),
       ("Reach beyond us (ONDC)","Your shop and reputation work across the open network — you're never locked in."),
       ("Your own dashboard","Orders, payouts and messages in your language, on your phone.")]
gx,gy,gw,gh=0.9,2.2,3.84,1.95
for i,(h,d) in enumerate(feats):
    cx=gx+(i%3)*(gw+0.16); cy=gy+(i//3)*(gh+0.2)
    card(s,cx,cy,gw,gh)
    circle(s,cx+0.28,cy+0.3,0.55,SOFT,"✦",MARI,15)
    box(s,cx+0.98,cy+0.32,gw-1.15,0.55,h,15,INK,bold=True,font=SERIF,anchor=MSO_ANCHOR.MIDDLE)
    box(s,cx+0.3,cy+1.05,gw-0.6,0.8,d,11.5,INK2,line_sp=1.12)

# ===== 7. FOR BUYERS =====
s=slide(PAPER)
eyebrow(s,0.9,0.7,"For buyers")
box(s,0.9,1.05,11.5,0.9,"Buy real. Know exactly who made it.",30,INK,bold=True,font=SERIF)
by=[("✓","Verified authenticity","Every piece is checked — a real Banarasi is provably a real Banarasi, not a copy."),
    ("👤","Meet the maker","See the artisan, their cluster, and the story behind what you're buying."),
    ("🛡","Full buyer protection","Platform-backed — if it isn't as described, you're covered."),
    ("🌍","Craft from all of India","Handloom, gems, jewellery and hands-on workshops, in one trusted place.")]
for i,(g,h,d) in enumerate(by):
    cx=0.9+(i%2)*5.95; cy=2.25+(i//2)*1.85
    card(s,cx,cy,5.8,1.65)
    circle(s,cx+0.32,cy+0.35,0.62,SOFT,g,LEAF,16)
    box(s,cx+1.1,cy+0.28,4.5,0.5,h,16,INK,bold=True,font=SERIF)
    box(s,cx+1.1,cy+0.8,4.5,0.7,d,12,INK2,line_sp=1.1)

# ===== 8. FOR PARTNERS =====
s=slide(PAPER)
eyebrow(s,0.9,0.7,"For partners")
box(s,0.9,1.05,11.5,0.9,"Cooperatives, NGOs, GI boards & government.",30,INK,bold=True,font=SERIF)
box(s,0.9,1.95,11.5,0.55,"Bring your whole community online at once — and get the formalisation and reporting the state wants to see.",15,INK2,line_sp=1.12)
pt=[("Onboard hundreds at once","One cooperative or cluster = hundreds of verified makers, live together."),
    ("Formalise your members","Artisans gain an e-Shram UAN, banking, and a path into the formal economy."),
    ("Deliver schemes that land","Route government schemes to real, verified beneficiaries — with proof."),
    ("An outcome dashboard","Livelihoods, women's participation, exports — the numbers a ministry needs.")]
gx,gy,gw,gh=0.9,2.7,5.8,1.6
for i,(h,d) in enumerate(pt):
    cx=gx+(i%2)*(gw+0.16); cy=gy+(i//2)*(gh+0.18)
    card(s,cx,cy,gw,gh)
    circle(s,cx+0.3,cy+0.32,0.6,SOFT,"★",MARI,16)
    box(s,cx+1.05,cy+0.24,gw-1.3,0.5,h,15.5,INK,bold=True,font=SERIF)
    box(s,cx+1.05,cy+0.74,gw-1.3,0.7,d,12,INK2,line_sp=1.1)

# ===== 9. PLANS =====
s=slide(PAPER)
eyebrow(s,0.9,0.7,"Simple plans")
box(s,0.9,1.05,11.5,0.9,"Pick your plan. No free tier, no surprises.",30,INK,bold=True,font=SERIF)
box(s,0.9,1.95,11.5,0.5,"Every maker is on a paid plan, so the platform stays healthy and never runs at a loss. Annual billing (2 months free) arrives at launch.",14.5,INK2,line_sp=1.12)
plans=[("Karigar","Individual artisan","₹799","/mo"),("Vyapari","Workshop / trader","₹3,999","/mo"),
       ("Niryatak","Exporter","₹11,999","/mo"),("Sansthan","Co-op / NGO / state","Custom","")]
gx,gy,gw,gh=0.9,2.75,2.95,2.4
for i,(nm,gl,pr,per) in enumerate(plans):
    cx=gx+i*(gw+0.12)
    card(s,cx,gy,gw,gh)
    box(s,cx,gy+0.35,gw,0.6,nm,21,MARI,bold=True,font=SERIF,align=PP_ALIGN.CENTER)
    box(s,cx,gy+1.0,gw,0.4,gl,11,INK3,align=PP_ALIGN.CENTER)
    box(s,cx,gy+1.55,gw,0.7,[(pr,{"size":26,"bold":True,"color":INK,"font":SERIF}),(per,{"size":12,"color":INK2})],26,INK,align=PP_ALIGN.CENTER)
box(s,0.9,5.45,11.5,0.5,[("Buyers from the diaspora can join ",{"size":13,"color":INK2}),
    ("Pravasi",{"size":13,"color":MARI,"bold":True}),(" — a ₹2,999/year membership to buy, gift and sponsor makers.",{"size":13,"color":INK2})],13,INK2)

# ===== 10. JOIN CTA =====
s=slide(BROWN)
eyebrow(s,0.9,1.1,"Join us",MARI)
box(s,0.9,1.6,11.5,1.6,[("Your craft deserves the world.\n",{"size":42,"bold":True,"color":WHITE,"font":SERIF}),
    ("Let's get you there.",{"size":42,"bold":True,"color":MARI,"font":SERIF})],42,WHITE,font=SERIF,line_sp=1.05)
box(s,0.92,3.9,11,0.8,"Bring yourself, your cooperative, or your whole cluster. We'll verify you, list your craft in your language, and pay you fairly — fast.",16,CREAM,line_sp=1.3,font=SERIF)
for i,t in enumerate(["Makers — list by voice","Buyers — shop verified","Partners — onboard your cluster"]):
    cx=0.9+i*4.05
    circle(s,cx,5.4,0.5,MARI,str(i+1),WHITE,15)
    box(s,cx+0.65,5.5,3.3,0.5,t,14,WHITE,bold=True,font=SERIF)
box(s,0.9,6.7,11.5,0.4,"NEXUS — आपकी कारीगरी, पूरी दुनिया तक। verified · fair · in your language.",13,MARI,italic=True,font=SERIF)

# ---- bilingual speaker notes (EN + HI) ----
NOTES=[
 "[EN] This deck is for makers, buyers and partners — warm, not corporate. Open by speaking to the maker directly: 'you're exactly who we built this for.'\n[HI] यह प्रस्तुति कारीगरों, खरीदारों और साझेदारों के लिए है — आत्मीय, औपचारिक नहीं। सीधे कारीगर से कहें: 'हमने यह आपके ही लिए बनाया है।'",
 "[EN] Make everyone feel included — registered or not, any craft. Land the line: no GST or company needed to start.\n[HI] सबको शामिल महसूस कराएं — पंजीकृत हों या नहीं, कोई भी शिल्प। मुख्य बात: शुरू करने के लिए GST या कंपनी ज़रूरी नहीं।",
 "[EN] Show the breadth — goods, services and experiences. Point out they can earn from a workshop, not only from selling goods.\n[HI] विस्तार दिखाएं — सामान, सेवाएं और अनुभव। बताएं कि वे सिर्फ़ सामान बेचकर नहीं, कार्यशाला से भी कमा सकते हैं।",
 "[EN] The benefits slide is the heart. Hit the 81% number and 'paid in 2 days to your own bank' hard — that's what makers care about.\n[HI] यह स्लाइड दिल है। '81%' और 'अपने बैंक में 2 दिन में भुगतान' पर ज़ोर दें — कारीगरों को यही सबसे ज़्यादा मायने रखता है।",
 "[EN] Keep the three steps simple and concrete. Emphasize 'we do the hard parts' — papers, tax, verification.\n[HI] तीन चरण सरल और ठोस रखें। 'मुश्किल काम हम करते हैं' पर ज़ोर दें — कागज़, कर, सत्यापन।",
 "[EN] Walk the toolkit quickly; the standout features are voice/icon listing and ONDC reach (you're never locked in).\n[HI] टूलकिट जल्दी दिखाएं; खास बातें हैं आवाज़/चित्र से सूची और ONDC पहुँच (आप कभी बंधे नहीं रहते)।",
 "[EN] Switch tone for buyers — trust and story. 'A real Banarasi is provably a real Banarasi.'\n[HI] खरीदारों के लिए लहजा बदलें — भरोसा और कहानी। 'असली बनारसी, प्रमाण के साथ असली।'",
 "[EN] For a cooperative or government partner, lead here: onboard hundreds at once, formalise members, deliver schemes, hand back a dashboard.\n[HI] सहकारी या सरकारी साझेदार के लिए यहीं से शुरू करें: सैकड़ों को एक साथ जोड़ें, सदस्यों को औपचारिक बनाएं, योजनाएं पहुंचाएं, डैशबोर्ड दें।",
 "[EN] Be upfront on pricing: no free tier, never at a loss. Frame it as 'so the platform — and you — last.'\n[HI] दाम पर स्पष्ट रहें: कोई मुफ़्त नहीं, कभी घाटे में नहीं। ऐसे कहें: 'ताकि मंच — और आप — टिके रहें।'",
 "[EN] Close warm and active. Invite all three: makers, buyers, partners. End on the Hindi line for the room.\n[HI] गर्मजोशी और सक्रियता से समाप्त करें। तीनों को बुलाएं: कारीगर, खरीदार, साझेदार। अंत हिंदी पंक्ति पर करें।",
]
for sl,nt in zip(prs.slides,NOTES):
    sl.notes_slide.notes_text_frame.text=nt

prs.save("/mnt/user-data/outputs/NEXUS-Join-Us-Deck.pptx")
print("saved NEXUS-Join-Us-Deck.pptx with",len(prs.slides._sldIdLst),"slides")

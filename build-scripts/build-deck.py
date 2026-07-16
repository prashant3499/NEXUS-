#!/usr/bin/env python3
"""NEXUS founder/investor deck — Indigo & Brass. python-pptx."""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION

# ---- palette (Indigo & Brass — the product's own identity) ----
INK    = RGBColor(0x22,0x1C,0x33)   # deep indigo-ink
INDIGO = RGBColor(0x27,0x22,0x47)   # dark surface
INDIGO2= RGBColor(0x39,0x33,0x6A)
PAPER  = RGBColor(0xFF,0xFF,0xFF)   # white content bg (crisp, not cream)
SOFT   = RGBColor(0xF3,0xEF,0xE6)   # raw-silk tint for cards
BRASS  = RGBColor(0xA0,0x6B,0x2C)
BRASS2 = RGBColor(0xC9,0xA8,0x77)
SAGE   = RGBColor(0x5E,0x6B,0x4A)
MADDER = RGBColor(0x8A,0x33,0x24)
INK2   = RGBColor(0x57,0x4F,0x66)
INK3   = RGBColor(0x93,0x8B,0xA1)
LINE   = RGBColor(0xE3,0xDC,0xCD)
WHITE  = RGBColor(0xFF,0xFF,0xFF)
CREAMTX= RGBColor(0xCF,0xC8,0xDE)   # light text on indigo

SERIF = "Bookman Old Style"  # safe-list serif w/ personality (display)
SANS  = "Calibri"            # safe-list sans (body)

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
SW, SH = prs.slide_width, prs.slide_height
BLANK = prs.slide_layouts[6]

def slide(bg=PAPER):
    s = prs.slides.add_slide(BLANK)
    r = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0,0, SW, SH)
    r.fill.solid(); r.fill.fore_color.rgb = bg; r.line.fill.background()
    r.shadow.inherit = False
    return s

def box(s, x,y,w,h, text, size, color, *, bold=False, italic=False, font=SANS,
        align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=None, line_sp=1.0):
    tb = s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)); tf=tb.text_frame
    tf.word_wrap=True; tf.vertical_anchor=anchor
    tf.margin_left=0; tf.margin_right=0; tf.margin_top=0; tf.margin_bottom=0
    runs = text if isinstance(text,list) else [(text,{})]
    for i,(t,o) in enumerate(runs):
        p = tf.paragraphs[0] if i==0 else tf.add_paragraph()
        p.alignment = o.get("align",align); p.line_spacing=line_sp
        if o.get("space_after") is not None: p.space_after=Pt(o["space_after"])
        r=p.add_run(); r.text=t; f=r.font
        f.size=Pt(o.get("size",size)); f.name=o.get("font",font)
        f.bold=o.get("bold",bold); f.italic=o.get("italic",italic)
        f.color.rgb=o.get("color",color)
        if o.get("spacing",spacing) is not None:
            from pptx.oxml.ns import qn
            rPr=r._r.get_or_add_rPr(); rPr.set("spc",str(int(o.get("spacing",spacing)*100)))
    return tb

def card(s, x,y,w,h, fill=WHITE, shadow=True, radius=True):
    shp=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE,
                           Inches(x),Inches(y),Inches(w),Inches(h))
    shp.fill.solid(); shp.fill.fore_color.rgb=fill; shp.line.color.rgb=LINE; shp.line.width=Pt(0.75)
    if radius:
        try: shp.adjustments[0]=0.06
        except Exception: pass
    sh=shp.shadow
    if shadow:
        sh.inherit=False
        spPr=shp._element.spPr
        from pptx.oxml.ns import qn
        el=spPr.makeelement(qn('a:effectLst'),{}); spPr.append(el)
        outer=el.makeelement(qn('a:outerShdw'),{'blurRad':'90000','dist':'38100','dir':'5400000','rotWithShape':'0'}); el.append(outer)
        clr=outer.makeelement(qn('a:srgbClr'),{'val':'221C33'}); outer.append(clr)
        alpha=clr.makeelement(qn('a:alpha'),{'val':'12000'}); clr.append(alpha)
    else:
        sh.inherit=False
    return shp

def circle(s, x,y,d, fill, glyph="", gcolor=WHITE, gsize=15):
    c=s.shapes.add_shape(MSO_SHAPE.OVAL,Inches(x),Inches(y),Inches(d),Inches(d))
    c.fill.solid(); c.fill.fore_color.rgb=fill; c.line.fill.background(); c.shadow.inherit=False
    if glyph:
        tf=c.text_frame; tf.word_wrap=False; p=tf.paragraphs[0]; p.alignment=PP_ALIGN.CENTER
        r=p.add_run(); r.text=glyph; r.font.size=Pt(gsize); r.font.bold=True; r.font.color.rgb=gcolor; r.font.name=SANS
    return c

def eyebrow(s, x,y, text, color=BRASS):
    box(s,x,y,6,0.3,text.upper(),12,color,bold=True,font=SANS,spacing=2.5)

# ============================ 1. TITLE ============================
s=slide(INDIGO)
# warp motif: faint vertical brass threads
for i in range(14):
    ln=s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6+i*0.92), Inches(0), Pt(1), SH)
    ln.fill.solid(); ln.fill.fore_color.rgb=INDIGO2; ln.line.fill.background(); ln.shadow.inherit=False
circle(s,0.9,0.85,0.5,BRASS,"N",WHITE,20)
box(s,1.55,0.9,6,0.5,"NEXUS",20,WHITE,bold=True,font=SERIF,spacing=4)
box(s,0.9,2.5,11.5,2.2,[
    ("The trust & compliance engine\n",{"size":50,"bold":True,"color":WHITE,"font":SERIF}),
],40,WHITE,font=SERIF,line_sp=1.02)
box(s,0.9,3.5,11.5,1.4,[("for India's craft economy.",{"size":50,"bold":True,"color":BRASS2,"font":SERIF})],40,BRASS2,font=SERIF)
box(s,0.92,5.05,11,0.9,"A weaver in Khurja who can't read, with no GST number, sells to a buyer in Berlin — verified, compliant, paid to her bank in two days, with zero legal liability.",
    16,CREAMTX,italic=True,font=SERIF,line_sp=1.2)
box(s,0.92,6.5,11,0.4,"AI-OPERATED · FOUNDER-IN-THE-LOOP · BUILT ON INDIA'S DIGITAL PUBLIC INFRASTRUCTURE",11,BRASS2,bold=True,spacing=1.5)

# ============================ 2. PROBLEM ============================
s=slide(PAPER)
eyebrow(s,0.9,0.7,"The problem")
box(s,0.9,1.05,11.5,0.9,"India's makers are locked out of their own market.",32,INK,bold=True,font=SERIF)
probs=[("🚫","No papers, no access","The best artisans have no GST, no PAN, no company. Every big marketplace requires them — so the makers who most need reach simply can't join."),
       ("％","20–40% taken","Global platforms take a fifth to two-fifths of each sale, and pay slowly. The maker — the person who made the thing — keeps the least."),
       ("?","Trust is a guess","Buyers can't tell a real Banarasi from a fake, or know who made it. \"Handmade\" is a claim, not a proof.")]
x=0.9; cw=3.84
for i,(g,h,d) in enumerate(probs):
    cx=x+i*(cw+0.16)
    card(s,cx,2.2,cw,3.5)
    circle(s,cx+0.35,2.55,0.7,SOFT,g,BRASS,20)
    box(s,cx+0.35,3.45,cw-0.7,0.8,h,18,INK,bold=True,font=SERIF)
    box(s,cx+0.35,4.25,cw-0.7,1.3,d,13,INK2,line_sp=1.12)
box(s,0.9,6.05,11.5,0.5,"The result: a $71B craft economy where the makers stay poor and undocumented, and buyers stay unsure.",14,MADDER,italic=True,font=SERIF)

# ============================ 3. WHAT NEXUS IS ============================
s=slide(PAPER)
eyebrow(s,0.9,0.7,"What NEXUS is")
box(s,0.9,1.05,11.5,0.9,"One universal core. The platform becomes the seller.",32,INK,bold=True,font=SERIF)
box(s,0.9,1.95,11.5,0.7,"NEXUS is a status-aware Merchant of Record: it legally stands in as the seller, so an undocumented artisan can trade like a registered exporter — and the platform carries every line of compliance.",15,INK2,line_sp=1.15)
# flow: Maker -> NEXUS core -> Buyer
y=3.4
card(s,0.9,y,3.1,2.0,SOFT); box(s,1.1,y+0.3,2.7,0.5,"THE MAKER",12,BRASS,bold=True,spacing=1.5)
box(s,1.1,y+0.8,2.7,1.0,[("No GST · no company\n",{"size":13,"color":INK2}),("Speaks, doesn't type\n",{"size":13,"color":INK2}),("Keeps the majority",{"size":13,"color":INK,"bold":True})],13,INK2,line_sp=1.15)
card(s,5.1,y-0.35,3.1,2.7,INDIGO,shadow=True); box(s,5.3,y-0.05,2.7,0.5,"NEXUS CORE",12,BRASS2,bold=True,spacing=1.5)
box(s,5.3,y+0.45,2.7,2.0,[("Merchant of Record\n",{"size":13,"color":WHITE,"bold":True}),("Identity & provenance\n",{"size":12.5,"color":CREAMTX}),("GST · TCS · payouts\n",{"size":12.5,"color":CREAMTX}),("Never in loss",{"size":12.5,"color":BRASS2,"bold":True})],13,CREAMTX,line_sp=1.18)
card(s,9.3,y,3.1,2.0,SOFT); box(s,9.5,y+0.3,2.7,0.5,"THE BUYER",12,BRASS,bold=True,spacing=1.5)
box(s,9.5,y+0.8,2.7,1.0,[("Verified authenticity\n",{"size":13,"color":INK2}),("Sees who made it\n",{"size":13,"color":INK2}),("Full protection",{"size":13,"color":INK,"bold":True})],13,INK2,line_sp=1.15)
for ax in (4.15, 8.35):
    a=s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW,Inches(ax),Inches(y+0.78),Inches(0.8),Inches(0.45))
    a.fill.solid(); a.fill.fore_color.rgb=BRASS; a.line.fill.background(); a.shadow.inherit=False

# ============================ 4. BUSINESS ENGINE (money) ============================
s=slide(PAPER)
eyebrow(s,0.9,0.7,"The business engine")
box(s,0.9,1.05,7,0.9,"Every rupee is sliced the same way — and the maker keeps most.",30,INK,bold=True,font=SERIF,line_sp=1.0)
box(s,0.9,2.72,5.2,0.6,"On a ₹5,000 sale, at the platform's 12% fee:",15,INK2)
# stat callouts
stats=[("₹4,067","to the maker","81.3% of the sale",SAGE),
       ("12%","platform fee","not 20–40%",BRASS),
       ("~2 days","to the bank","not weeks",INK)]
for i,(n,l,sub,col) in enumerate(stats):
    cy=3.4+i*1.08
    box(s,0.9,cy,2.2,0.7,n,40,col,bold=True,font=SERIF)
    box(s,3.2,cy+0.05,3.0,0.8,[(l+"\n",{"size":14,"color":INK,"bold":True}),(sub,{"size":12,"color":INK3})],14,INK,line_sp=1.05)
# pie chart of the split
cd=CategoryChartData(); cd.categories=["Maker payout","Platform fee","GST + gateway + taxes"]
cd.add_series("Split",(0.813,0.12,0.067))
gf=s.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT, Inches(7.2),Inches(2.4),Inches(5.6),Inches(4.4),cd).chart
gf.has_legend=True; gf.legend.position=XL_LEGEND_POSITION.BOTTOM; gf.legend.include_in_layout=False
gf.legend.font.size=Pt(11); gf.legend.font.name=SANS
plot=gf.plots[0]; plot.has_data_labels=True; dl=plot.data_labels; dl.number_format='0.0%'; dl.number_format_is_linked=False
dl.font.size=Pt(11); dl.font.bold=True; dl.font.color.rgb=WHITE
from pptx.oxml.ns import qn as _qn
pts=[SAGE,BRASS,INK2]
series=plot.series[0]
for idx,col in enumerate(pts):
    pt=series.points[idx]; pt.format.fill.solid(); pt.format.fill.fore_color.rgb=col
box(s,0.9,6.55,6,0.5,"A hard \"never-in-loss\" guard sits under every transaction — the platform cannot be configured to lose money.",13,INK2,italic=True)

# ============================ 5. ALL VERTICALS ============================
s=slide(PAPER)
eyebrow(s,0.9,0.7,"One core, every vertical")
box(s,0.9,1.05,11.5,0.9,"A trade is a config entry — not new code.",32,INK,bold=True,font=SERIF)
box(s,0.9,1.95,11.5,0.6,"The same engine runs handicrafts, gems, jewellery, textiles and tourism across three modalities. Adding the next vertical is a form, not a release.",15,INK2,line_sp=1.15)
cells=[("🏺","Handicraft","Pottery, leather, brass, marble — shipped with provenance"),
       ("🧵","Textiles","Banarasi, ikat, Bagru natural-dye — GI-protected handloom"),
       ("💍","Jewellery","Kundan-meenakari, silver filigree — hallmarked"),
       ("💎","Gems","Lab-certified coloured stones from Jaipur"),
       ("🌿","Natural & sustainable","Vegetable-tanned, natural-dyed, traceable"),
       ("🎟️","Experiences","Craft tours & workshops — safety-checked")]
gx,gy,gw,gh=0.9,2.8,3.84,1.75
for i,(g,h,d) in enumerate(cells):
    cx=gx+(i%3)*(gw+0.16); cy=gy+(i//3)*(gh+0.18)
    card(s,cx,cy,gw,gh)
    circle(s,cx+0.28,cy+0.3,0.6,SOFT,g,BRASS,17)
    box(s,cx+1.05,cy+0.32,gw-1.2,0.5,h,16,INK,bold=True,font=SERIF)
    box(s,cx+1.05,cy+0.85,gw-1.25,0.8,d,11.5,INK2,line_sp=1.1)

# ============================ 6. FOUNDER IN THE LOOP ============================
s=slide(INDIGO)
eyebrow(s,0.9,0.6,"Founder-in-the-loop",BRASS2)
box(s,0.9,0.95,11.5,1.15,"The AI does the work. The founder holds the keys.",30,WHITE,bold=True,font=SERIF,line_sp=1.02)
box(s,0.9,2.2,11.5,0.6,"Autonomous agents run the platform — but five hard invariants are enforced at every boundary, and cannot be overridden, even by the founder's own command.",14,CREAMTX,line_sp=1.12)
invs=[("Never in loss","No setting, no command can make the platform lose money."),
      ("Consent before sale","Nothing a maker hasn't agreed to is ever listed or sold."),
      ("Child safety","Hard-blocked everywhere, unconditionally."),
      ("No fabrication","Unprovable claims are never printed — provenance is checked, not invented."),
      ("Honest stage","The platform always tells the truth about what's real vs mock.")]
for i,(h,d) in enumerate(invs):
    cy=3.05+i*0.78
    circle(s,0.9,cy,0.5,BRASS,"✓",WHITE,14)
    box(s,1.6,cy-0.02,3.5,0.6,h,16,WHITE,bold=True,font=SERIF,anchor=MSO_ANCHOR.MIDDLE)
    box(s,5.2,cy-0.02,7.2,0.6,d,13,CREAMTX,line_sp=1.05,anchor=MSO_ANCHOR.MIDDLE)
box(s,0.9,7.05,11.5,0.35,"Plus founder-in-the-loop money gates: any spend above a set threshold pauses for human approval.",12,BRASS2,italic=True)

# ============================ 7. AI EXECUTIVE TEAM ============================
s=slide(PAPER)
eyebrow(s,0.9,0.7,"The AI executive team")
box(s,0.9,1.05,11.5,0.9,"Ten AI CXOs analyse. The founder decides.",32,INK,bold=True,font=SERIF)
box(s,0.9,1.95,11.5,0.55,"Each officer reads the live business, flags findings, and recommends — then surfaces cross-functional tension (the CMO wants to spend; the CFO guards margin). One human holds the final call.",14.5,INK2,line_sp=1.12)
cxos=[("CFO","Financial — P&L, never-in-loss"),("CRO","Revenue — sales pipeline"),("CMO","Marketing — creatives & budget"),
      ("COO","Operations — fulfilment, returns"),("CSO","Strategy — supply activation"),("CCO","Compliance — DPDP, GST, KYC"),
      ("CTO","Technology — engine health"),("CPO","Product — surface & roadmap"),("Growth","Acquisition & channels"),("Risk","Fraud & controls")]
gx,gy,gw,gh=0.9,2.75,2.3,1.35
for i,(role,desc) in enumerate(cxos):
    cx=gx+(i%5)*(gw+0.16); cy=gy+(i//5)*(gh+0.2)
    card(s,cx,cy,gw,gh)
    box(s,cx+0.18,cy+0.16,gw-0.3,0.5,role,17,BRASS,bold=True,font=SERIF)
    box(s,cx+0.18,cy+0.62,gw-0.34,0.65,desc,11,INK2,line_sp=1.05)
box(s,0.9,6.75,11.5,0.5,"A founder running a full C-suite's analysis — without a full C-suite's payroll.",14,SAGE,italic=True,font=SERIF)

# ============================ 8. GOVERNMENT ============================
s=slide(PAPER)
eyebrow(s,0.9,0.7,"Benefits to government")
box(s,0.9,1.05,11.5,0.9,"NEXUS lowers the state's cost of formalising the informal.",30,INK,bold=True,font=SERIF)
gben=[("Formalises makers","Brings undocumented artisans into tax, banking & welfare via e-Shram UAN — the last-mile job the state struggles to do."),
      ("Delivers schemes","Routes government schemes to verified, real beneficiaries (myScheme) and hands back an outcome dashboard."),
      ("Protects craft IP","GI-tagged provenance defends India's craft heritage — a stated national priority."),
      ("Lifts the paperwork","As Merchant of Record, the platform — not the poor citizen — carries the compliance burden.")]
for i,(h,d) in enumerate(gben):
    cx=0.9+(i%2)*5.95; cy=2.25+(i//2)*1.75
    card(s,cx,cy,5.8,1.55)
    circle(s,cx+0.3,cy+0.32,0.6,SOFT,"★",BRASS,16)
    box(s,cx+1.05,cy+0.22,4.6,0.5,h,16,INK,bold=True,font=SERIF)
    box(s,cx+1.05,cy+0.72,4.6,0.75,d,12,INK2,line_sp=1.1)
box(s,0.9,5.95,11.5,0.9,[("Projected at 1,000 artisans:  ",{"size":14,"color":INK,"bold":True}),
    ("1,000 formalised · ~₹24L to the exchequer · ~₹1.8Cr export GMV · 55% women.",{"size":14,"color":SAGE,"italic":True})],14,INK,font=SERIF)

# ============================ 9. DPI RAILS ============================
s=slide(PAPER)
eyebrow(s,0.9,0.7,"The rails underneath")
box(s,0.9,1.05,11.5,0.9,"Built on India's public digital infrastructure.",32,INK,bold=True,font=SERIF)
rails=[("DigiLocker","Consent-based identity & documents"),("e-Shram","Worker UAN & formalisation"),
       ("GSTN","Tax as Merchant of Record"),("ONDC","Open, portable commerce"),
       ("Bhashini","13 Indian languages, voice-first"),("UPI","Instant bank payouts")]
gx,gy,gw,gh=0.9,2.5,3.84,1.7
for i,(h,d) in enumerate(rails):
    cx=gx+(i%3)*(gw+0.16); cy=gy+(i//3)*(gh+0.2)
    card(s,cx,cy,gw,gh)
    box(s,cx+0.3,cy+0.28,gw-0.6,0.55,h,18,BRASS,bold=True,font=SERIF)
    box(s,cx+0.3,cy+0.85,gw-0.6,0.7,d,12.5,INK2,line_sp=1.1)
box(s,0.9,6.5,11.5,0.5,"Consent-based, purpose-limited, data-minimised — the trust posture a government partner needs to see.",13,INK2,italic=True)

# ============================ 10. SCALE / NUMBERS ============================
s=slide(INDIGO)
eyebrow(s,0.9,0.7,"What's already built",BRASS2)
box(s,0.9,1.05,11.5,0.9,"An engine, not a slide deck.",32,WHITE,bold=True,font=SERIF)
nums=[("104","modules"),("101","test suites"),("3,913","tests passing"),
      ("10","AI CXOs"),("13","languages"),("0","npm dependencies")]
for i,(n,l) in enumerate(nums):
    cx=0.9+(i%3)*4.05; cy=2.45+(i//3)*2.0
    box(s,cx,cy,3.7,1.0,n,54,BRASS2,bold=True,font=SERIF)
    box(s,cx,cy+1.05,3.7,0.5,l.upper(),13,CREAMTX,bold=True,spacing=1.5)
box(s,0.9,6.75,11.5,0.4,"Pure Node.js · status-aware Merchant of Record · one universal trade-agnostic core.",12.5,BRASS2,italic=True)

# ============================ 11. HONEST STAGE ============================
s=slide(PAPER)
eyebrow(s,0.9,0.7,"Where we honestly are")
box(s,0.9,1.05,11.5,0.9,"The brain is built. The senses need switching on.",30,INK,bold=True,font=SERIF)
# two columns: built / needed
card(s,0.9,2.3,5.8,4.0,SOFT)
box(s,1.2,2.55,5.2,0.5,"BUILT & TESTED",13,SAGE,bold=True,spacing=1.5)
for i,t in enumerate(["One universal core · 3,913 tests","Money engine, never-in-loss guard","AES-256 + PII masking, DPDP-ready","Government + DPI integration seams","10 AI CXOs + founder-in-the-loop"]):
    box(s,1.2,3.1+i*0.58,5.3,0.5,[("✓  ",{"color":SAGE,"bold":True,"size":14}),(t,{"color":INK,"size":13.5})],13.5,INK)
card(s,6.95,2.3,5.45,4.0,WHITE)
box(s,7.25,2.55,5.0,0.5,"NEEDED FOR PRODUCTION",13,MADDER,bold=True,spacing=1.5)
for i,t in enumerate(["A live payment & payout rail","Real KYC (DigiLocker / UIDAI)","Lawyer sign-off on MoR + TCS","A first pilot with real makers","Postgres + rotated secrets"]):
    box(s,7.25,3.1+i*0.58,4.9,0.5,[("•  ",{"color":MADDER,"bold":True,"size":14}),(t,{"color":INK,"size":13.5})],13.5,INK)
box(s,0.9,6.5,11.5,0.5,"The platform refuses to take real money until a lawyer has signed off — honesty is enforced in code, not promised.",13,INK2,italic=True)

# ============================ 12. CLOSING / ASK ============================
s=slide(INDIGO)
for i in range(14):
    ln=s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6+i*0.92), Inches(0), Pt(1), SH)
    ln.fill.solid(); ln.fill.fore_color.rgb=INDIGO2; ln.line.fill.background(); ln.shadow.inherit=False
eyebrow(s,0.9,1.0,"The next step",BRASS2)
box(s,0.9,1.5,11.5,1.6,[("One state. One cluster.\n",{"size":44,"bold":True,"color":WHITE,"font":SERIF}),
    ("One pilot that lights the flywheel.",{"size":44,"bold":True,"color":BRASS2,"font":SERIF})],44,WHITE,font=SERIF,line_sp=1.04)
box(s,0.92,3.9,11,0.9,"A government-partnered pilot brings makers, demand, and funding at once. Give the engine its three unlocks — a payment rail, real KYC, and a lawyer's sign-off — and it turns.",16,CREAMTX,line_sp=1.3,font=SERIF)
for i,t in enumerate(["Payment rail","Real KYC","Legal sign-off","One pilot"]):
    cx=0.9+i*3.0
    circle(s,cx,5.5,0.5,BRASS,str(i+1),WHITE,16)
    box(s,cx+0.65,5.6,2.3,0.5,t,15,WHITE,bold=True,font=SERIF)
box(s,0.9,6.8,11.5,0.4,"NEXUS — the trust & compliance engine for India's craft economy.",13,BRASS2,italic=True,font=SERIF)

NOTES = [
 # 1 Title
 "[EN] Open with the one-line promise, then read the weaver story slowly — pause after 'zero legal liability'. That one sentence is the whole company.\n[HI] एक पंक्ति के वादे से शुरू करें, फिर बुनकर की कहानी धीरे पढ़ें — 'कोई कानूनी ज़िम्मेदारी नहीं' के बाद रुकें। यही एक वाक्य पूरी कंपनी है।",
 # 2 Problem
 "[EN] Land all three pains. The killer line: the best artisans literally cannot join Amazon or Etsy because they have no GST or PAN. That exclusion is our opening.\n[HI] तीनों दर्द बताएं। मुख्य बात: सबसे अच्छे कारीगर GST या PAN न होने से Amazon या Etsy पर जुड़ ही नहीं सकते। यही बहिष्कार हमारा अवसर है।",
 # 3 What NEXUS is
 "[EN] Explain Merchant of Record simply: 'the platform legally becomes the seller, so the artisan need not be a company.' Walk the three-box flow left to right.\n[HI] Merchant of Record सरल भाषा में: 'मंच कानूनन विक्रेता बन जाता है, इसलिए कारीगर को कंपनी बनने की ज़रूरत नहीं।' तीन-बक्सों का प्रवाह बाएँ से दाएँ दिखाएं।",
 # 4 Engine
 "[EN] The number that matters: the maker keeps 81% on a 5,000-rupee sale. Stress never-in-loss — it is enforced in code, not a promise.\n[HI] अहम आंकड़ा: ₹5,000 की बिक्री पर कारीगर 81% रखता है। 'कभी घाटे में नहीं' पर ज़ोर दें — यह कोड में लागू है, सिर्फ़ वादा नहीं।",
 # 5 Verticals
 "[EN] Emphasize 'config, not code' — adding gems, jewellery or tourism is a form, not a rebuild. That is how one small team can address a 71-billion-dollar market.\n[HI] 'कोड नहीं, कॉन्फ़िग' पर ज़ोर दें — रत्न, आभूषण या पर्यटन जोड़ना एक फ़ॉर्म है, नया निर्माण नहीं। इसी से एक छोटी टीम $71B बाज़ार संभाल सकती है।",
 # 6 Founder-in-the-loop
 "[EN] This is the trust slide. The AI runs operations, but five invariants cannot be overridden — even by you. Autonomy with hard guardrails.\n[HI] यह भरोसे वाली स्लाइड है। AI संचालन चलाता है, पर पाँच नियम कोई नहीं बदल सकता — आप भी नहीं। सख़्त नियंत्रण के साथ स्वायत्तता।",
 # 7 CXOs
 "[EN] Ten AI officers do a full C-suite's analysis at near-zero cost — and they surface disagreement, so you decide with the trade-off visible.\n[HI] दस AI अधिकारी लगभग शून्य लागत पर पूरी C-suite का विश्लेषण करते हैं — और मतभेद सामने लाते हैं, ताकि आप समझौता देखकर फ़ैसला लें।",
 # 8 Government
 "[EN] For a government audience, lead here. We lower the state's cost of formalising the informal — the last-mile job they struggle to do.\n[HI] सरकारी श्रोताओं के लिए यहीं से शुरू करें। हम अनौपचारिक को औपचारिक बनाने की सरकारी लागत घटाते हैं — वह आख़िरी-छोर का काम जो उन्हें कठिन लगता है।",
 # 9 DPI rails
 "[EN] Reassure on trust posture: consent-based, purpose-limited, data-minimised. Built ON India's public infrastructure, not around it.\n[HI] भरोसे का रुख़ बताएं: सहमति-आधारित, सीमित-उद्देश्य, न्यूनतम-डेटा। भारत के सार्वजनिक ढांचे पर बना, उससे बचकर नहीं।",
 # 10 Scale
 "[EN] Show this is real engineering, not slideware: 104 modules, ~3,900 tests, zero dependencies. Don't oversell — pivot straight to the honest slide.\n[HI] दिखाएं कि यह असली इंजीनियरिंग है, सिर्फ़ स्लाइड नहीं: 104 मॉड्यूल, ~3,900 टेस्ट, शून्य निर्भरता। बढ़ा-चढ़ाकर न कहें — सीधे ईमानदार स्लाइड पर जाएं।",
 # 11 Honest stage
 "[EN] This slide builds credibility. Say plainly: the brain is built; we need a payment rail, KYC, a lawyer, and one pilot. Investors trust founders who name the gaps.\n[HI] यह स्लाइड विश्वसनीयता बनाती है। साफ़ कहें: दिमाग़ बन चुका है; हमें भुगतान-रेल, KYC, वकील और एक पायलट चाहिए। निवेशक उन्हीं संस्थापकों पर भरोसा करते हैं जो कमियाँ बताते हैं।",
 # 12 Ask
 "[EN] Make the ask concrete: one government-partnered pilot in one cluster, plus the three unlocks. End on the one-line promise again.\n[HI] मांग ठोस रखें: एक सरकार-साझेदार पायलट, एक क्लस्टर में, और तीन कुंजियाँ। अंत फिर उसी एक-पंक्ति वादे पर करें।",
]
for _slide, _note in zip(prs.slides, NOTES):
    _slide.notes_slide.notes_text_frame.text = _note

prs.save("/mnt/user-data/outputs/NEXUS-Founder-Deck.pptx")
print("saved NEXUS-Founder-Deck.pptx with", len(prs.slides._sldIdLst), "slides")

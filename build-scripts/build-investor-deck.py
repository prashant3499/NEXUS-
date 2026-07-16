#!/usr/bin/env python3
"""NEXUS investor cut — 8 tight slides. Indigo & Brass. python-pptx."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.oxml.ns import qn

INK=RGBColor(0x22,0x1C,0x33); INDIGO=RGBColor(0x27,0x22,0x47); INDIGO2=RGBColor(0x39,0x33,0x6A)
PAPER=RGBColor(0xFF,0xFF,0xFF); SOFT=RGBColor(0xF3,0xEF,0xE6); BRASS=RGBColor(0xA0,0x6B,0x2C)
BRASS2=RGBColor(0xC9,0xA8,0x77); SAGE=RGBColor(0x5E,0x6B,0x4A); MADDER=RGBColor(0x8A,0x33,0x24)
INK2=RGBColor(0x57,0x4F,0x66); INK3=RGBColor(0x93,0x8B,0xA1); LINE=RGBColor(0xE3,0xDC,0xCD)
WHITE=RGBColor(0xFF,0xFF,0xFF); CREAM=RGBColor(0xCF,0xC8,0xDE)
SERIF="Bookman Old Style"; SANS="Calibri"

prs=Presentation(); prs.slide_width=Inches(13.333); prs.slide_height=Inches(7.5)
SW,SH=prs.slide_width,prs.slide_height; BLANK=prs.slide_layouts[6]

def slide(bg=PAPER):
    s=prs.slides.add_slide(BLANK); r=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,0,0,SW,SH)
    r.fill.solid(); r.fill.fore_color.rgb=bg; r.line.fill.background(); r.shadow.inherit=False; return s
def box(s,x,y,w,h,text,size,color,*,bold=False,italic=False,font=SANS,align=PP_ALIGN.LEFT,anchor=MSO_ANCHOR.TOP,spacing=None,line_sp=1.0):
    tb=s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)); tf=tb.text_frame
    tf.word_wrap=True; tf.vertical_anchor=anchor
    tf.margin_left=0; tf.margin_right=0; tf.margin_top=0; tf.margin_bottom=0
    runs=text if isinstance(text,list) else [(text,{})]
    for i,(t,o) in enumerate(runs):
        p=tf.paragraphs[0] if i==0 else tf.add_paragraph(); p.alignment=o.get("align",align); p.line_spacing=line_sp
        if o.get("space_after") is not None: p.space_after=Pt(o["space_after"])
        r=p.add_run(); r.text=t; f=r.font
        f.size=Pt(o.get("size",size)); f.name=o.get("font",font); f.bold=o.get("bold",bold); f.italic=o.get("italic",italic); f.color.rgb=o.get("color",color)
        sp=o.get("spacing",spacing)
        if sp is not None: r._r.get_or_add_rPr().set("spc",str(int(sp*100)))
    return tb
def card(s,x,y,w,h,fill=WHITE,shadow=True):
    shp=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,Inches(x),Inches(y),Inches(w),Inches(h))
    shp.fill.solid(); shp.fill.fore_color.rgb=fill; shp.line.color.rgb=LINE; shp.line.width=Pt(0.75)
    try: shp.adjustments[0]=0.06
    except Exception: pass
    shp.shadow.inherit=False
    if shadow:
        spPr=shp._element.spPr; el=spPr.makeelement(qn('a:effectLst'),{}); spPr.append(el)
        o=el.makeelement(qn('a:outerShdw'),{'blurRad':'90000','dist':'34000','dir':'5400000','rotWithShape':'0'}); el.append(o)
        c=o.makeelement(qn('a:srgbClr'),{'val':'221C33'}); o.append(c); a=c.makeelement(qn('a:alpha'),{'val':'12000'}); c.append(a)
    return shp
def circle(s,x,y,d,fill,glyph="",gcolor=WHITE,gsize=16):
    c=s.shapes.add_shape(MSO_SHAPE.OVAL,Inches(x),Inches(y),Inches(d),Inches(d))
    c.fill.solid(); c.fill.fore_color.rgb=fill; c.line.fill.background(); c.shadow.inherit=False
    if glyph:
        p=c.text_frame.paragraphs[0]; p.alignment=PP_ALIGN.CENTER
        r=p.add_run(); r.text=glyph; r.font.size=Pt(gsize); r.font.bold=True; r.font.color.rgb=gcolor; r.font.name=SANS
    return c
def eyebrow(s,x,y,t,color=BRASS): box(s,x,y,9,0.3,t.upper(),12,color,bold=True,spacing=2.4)

# 1 TITLE
s=slide(INDIGO)
for i in range(14):
    ln=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,Inches(0.6+i*0.92),Inches(0),Pt(1),SH)
    ln.fill.solid(); ln.fill.fore_color.rgb=INDIGO2; ln.line.fill.background(); ln.shadow.inherit=False
circle(s,0.9,0.85,0.5,BRASS,"N",WHITE,20); box(s,1.55,0.9,6,0.5,"NEXUS",19,WHITE,bold=True,font=SERIF,spacing=3)
box(s,0.9,2.5,11.6,1.7,"The trust & compliance engine for India's craft economy.",46,WHITE,bold=True,font=SERIF,line_sp=1.03)
box(s,0.92,4.85,11,0.8,"Bringing India's undocumented makers into formal, global commerce — as a status-aware Merchant of Record.",17,CREAM,italic=True,font=SERIF,line_sp=1.25)
box(s,0.92,6.4,11,0.4,"PRE-SEED / PILOT  ·  AI-OPERATED, FOUNDER-IN-THE-LOOP  ·  BUILT ON INDIA'S DPI",11.5,BRASS2,bold=True,spacing=1.4)

# 2 PROBLEM + MARKET
s=slide(PAPER)
eyebrow(s,0.9,0.7,"The problem & the market")
box(s,0.9,1.05,11.6,0.9,"A $71B economy whose best makers are locked out.",30,INK,bold=True,font=SERIF)
box(s,0.9,2.0,7.2,3.6,[("India's craft economy is projected at ~$71B by 2030 — yet its finest artisans cannot join formal commerce.\n\n",{"size":15,"color":INK2}),
    ("• No GST, no PAN, no company → barred from Amazon / Etsy.\n",{"size":14,"color":INK,"space_after":6}),
    ("• Incumbents take 20–40% and pay slowly.\n",{"size":14,"color":INK,"space_after":6}),
    ("• Buyers can't verify authenticity — \u201chandmade\u201d is a claim, not proof.\n\n",{"size":14,"color":INK,"space_after":6}),
    ("Existing players are catalogues (Jaypore, iTokri) or aggregators (GoCoop) — none is the infrastructure that makes an undocumented maker tradeable.",{"size":14,"color":INK2,"italic":True})],14,INK2,line_sp=1.2)
for i,(n,l) in enumerate([("$71B","market by 2030"),("20–40%","taken by incumbents"),("0","platforms for the undocumented")]):
    cy=2.1+i*1.15
    box(s,8.5,cy,3.9,0.8,n,34,BRASS if i!=2 else MADDER,bold=True,font=SERIF)
    box(s,8.5,cy+0.72,3.9,0.4,l.upper(),11,INK3,bold=True,spacing=.8)

# 3 SOLUTION + MOAT
s=slide(PAPER)
eyebrow(s,0.9,0.7,"The solution & the moat")
box(s,0.9,1.05,11.6,0.9,"The platform becomes the seller — and that's the moat.",30,INK,bold=True,font=SERIF)
box(s,0.9,1.95,11.6,0.6,"As Merchant of Record, NEXUS lets an undocumented artisan trade like a registered exporter while the platform carries every line of compliance. Five things incumbents structurally can't copy:",14.5,INK2,line_sp=1.15)
moat=[("MoR for the undocumented","No GST/PAN needed — incumbents require them"),
      ("Verified provenance","Registry-checked, not a self-applied badge"),
      ("Voice & icon, 13 languages","Built for low-literacy makers"),
      ("ONDC-portable reputation","Not locked to one platform"),
      ("Makes makers bankable","e-Shram UAN + scheme access"),
      ("Lowers the state's cost","Of formalising the informal")]
gx,gy,gw,gh=0.9,2.85,3.84,1.6
for i,(h,d) in enumerate(moat):
    cx=gx+(i%3)*(gw+0.16); cy=gy+(i//3)*(gh+0.16)
    card(s,cx,cy,gw,gh)
    circle(s,cx+0.26,cy+0.28,0.5,SOFT,str(i+1),BRASS,14)
    box(s,cx+0.9,cy+0.26,gw-1.05,0.55,h,13.5,INK,bold=True,font=SERIF,anchor=MSO_ANCHOR.MIDDLE)
    box(s,cx+0.3,cy+0.92,gw-0.55,0.55,d,11.5,INK2,line_sp=1.08)

# 4 BUSINESS MODEL
s=slide(PAPER)
eyebrow(s,0.9,0.7,"Business model")
box(s,0.9,1.05,7,0.9,"12% fee. The maker keeps most. Never at a loss.",30,INK,bold=True,font=SERIF,line_sp=1.0)
for i,(n,l,sub,col) in enumerate([("₹4,067","to the maker","81.3% of a ₹5,000 sale",SAGE),("12%","platform fee","not 20–40%",BRASS),("3-way","loss guard","floors + commission + per-order",INK)]):
    cy=2.7+i*1.08
    box(s,0.9,cy,2.4,0.7,n,36,col,bold=True,font=SERIF)
    box(s,3.3,cy+0.06,3.0,0.8,[(l+"\n",{"size":14,"color":INK,"bold":True}),(sub,{"size":11.5,"color":INK3})],14,INK,line_sp=1.05)
cd=CategoryChartData(); cd.categories=["Maker","Platform fee","Taxes & gateway"]; cd.add_series("Split",(0.813,0.12,0.067))
ch=s.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT,Inches(7.4),Inches(2.3),Inches(5.4),Inches(3.6),cd).chart
ch.has_legend=True; ch.legend.position=XL_LEGEND_POSITION.BOTTOM; ch.legend.include_in_layout=False; ch.legend.font.size=Pt(11)
pl=ch.plots[0]; pl.has_data_labels=True; pl.data_labels.number_format='0.0%'; pl.data_labels.number_format_is_linked=False; pl.data_labels.font.size=Pt(10); pl.data_labels.font.color.rgb=WHITE; pl.data_labels.font.bold=True
for idx,col in enumerate([SAGE,BRASS,INK2]):
    pt=pl.series[0].points[idx]; pt.format.fill.solid(); pt.format.fill.fore_color.rgb=col
box(s,0.9,6.2,11.6,0.7,[("Recurring revenue: ",{"size":13.5,"color":INK,"bold":True}),
    ("paid plans (no free tier) — Karigar ₹799 · Vyapari ₹3,999 · Niryatak ₹11,999/mo · Sansthan custom; annual at launch.",{"size":13.5,"color":INK2})],13.5,INK2,line_sp=1.15)

# 5 WHAT'S BUILT + HONEST STAGE
s=slide(PAPER)
eyebrow(s,0.9,0.7,"Traction: an engine, not a deck")
box(s,0.9,1.05,11.6,0.9,"The brain is built. The senses need switching on.",30,INK,bold=True,font=SERIF)
for i,(n,l) in enumerate([("104","modules"),("~3,930","tests passing"),("10","AI CXOs"),("13","languages")]):
    cx=0.9+i*3.0
    box(s,cx,2.15,2.8,0.9,n,40,BRASS,bold=True,font=SERIF)
    box(s,cx,3.05,2.8,0.4,l.upper(),12,INK3,bold=True,spacing=1)
card(s,0.9,3.8,5.8,2.6,SOFT); box(s,1.2,4.05,5.2,0.45,"BUILT & TESTED",12,SAGE,bold=True,spacing=1.5)
for i,t in enumerate(["One universal core · 3,930 tests","Money engine + never-in-loss guard","DPDP-ready security; DPI seams","AI exec team + founder-in-the-loop"]):
    box(s,1.2,4.55+i*0.45,5.3,0.4,[("✓  ",{"color":SAGE,"bold":True,"size":13}),(t,{"color":INK,"size":12.5})],12.5,INK)
card(s,6.95,3.8,5.45,2.6,WHITE); box(s,7.25,4.05,5.0,0.45,"NEEDED FOR REVENUE",12,MADDER,bold=True,spacing=1.5)
for i,t in enumerate(["Live payment & payout rail","Real KYC (DigiLocker)","Lawyer sign-off on MoR + TCS","One pilot with real makers"]):
    box(s,7.25,4.55+i*0.45,4.9,0.4,[("•  ",{"color":MADDER,"bold":True,"size":13}),(t,{"color":INK,"size":12.5})],12.5,INK)
box(s,0.9,6.6,11.6,0.4,"The platform refuses to take real money until a lawyer signs off — honesty enforced in code.",12.5,INK2,italic=True)

# 6 UNFAIR ADVANTAGE — GOVERNMENT & DPI
s=slide(INDIGO)
eyebrow(s,0.9,0.7,"The unfair advantage",BRASS2)
box(s,0.9,1.05,11.6,0.9,"Government wants exactly what we do.",30,WHITE,bold=True,font=SERIF)
box(s,0.9,1.95,11.6,0.6,"We lower the state's cost of formalising the informal — the last-mile job it struggles with. That turns a regulator into a distribution channel.",14.5,CREAM,line_sp=1.15)
adv=[("Formalises makers","e-Shram UAN, banking, welfare — at the last mile"),
     ("Delivers schemes","To verified beneficiaries, with an outcome dashboard"),
     ("Protects craft IP","GI provenance — a national priority"),
     ("DPI-native","DigiLocker · e-Shram · GSTN · ONDC · Bhashini · UPI")]
for i,(h,d) in enumerate(adv):
    cx=0.9+(i%2)*5.95; cy=2.9+(i//2)*1.55
    card(s,cx,cy,5.8,1.4,RGBColor(0x2F,0x2A,0x55))
    circle(s,cx+0.3,cy+0.32,0.55,BRASS,"★",WHITE,15)
    box(s,cx+1.05,cy+0.24,4.6,0.5,h,15,WHITE,bold=True,font=SERIF)
    box(s,cx+1.05,cy+0.72,4.6,0.55,d,12,CREAM,line_sp=1.05)

# 7 FOUNDER-IN-THE-LOOP + AI TEAM
s=slide(PAPER)
eyebrow(s,0.9,0.7,"Why a solo founder can run this")
box(s,0.9,1.05,11.6,0.9,"Ten AI CXOs analyse. The founder decides. Hard rules can't be broken.",27,INK,bold=True,font=SERIF,line_sp=1.02)
box(s,0.9,2.1,11.6,0.55,"An AI executive team (CFO, CRO, CMO, COO, CSO, CCO, CTO, CPO, Growth, Risk) reads the live business and recommends — surfacing disagreement so the founder decides with the trade-off visible.",14,INK2,line_sp=1.15)
card(s,0.9,2.95,11.5,2.0,SOFT)
box(s,1.2,3.2,11,0.5,"FIVE INVARIANTS — ENFORCED IN CODE, NOT OVERRIDABLE EVEN BY THE FOUNDER",12,BRASS,bold=True,spacing=1.2)
inv=["Never in loss","Consent before sale","Child safety","No fabrication","Honest stage"]
for i,t in enumerate(inv):
    cx=1.2+i*2.2
    circle(s,cx,3.85,0.5,BRASS,"✓",WHITE,13)
    box(s,cx-0.05,4.45,2.1,0.6,t,12.5,INK,bold=True,font=SERIF,align=PP_ALIGN.LEFT)
box(s,0.9,5.25,11.6,0.6,"A full C-suite's analysis without a full C-suite's payroll — plus money gates that pause any large spend for human approval.",13.5,SAGE,italic=True,font=SERIF,line_sp=1.15)

# 8 THE ASK
s=slide(INDIGO)
for i in range(14):
    ln=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,Inches(0.6+i*0.92),Inches(0),Pt(1),SH)
    ln.fill.solid(); ln.fill.fore_color.rgb=INDIGO2; ln.line.fill.background(); ln.shadow.inherit=False
eyebrow(s,0.9,0.85,"The ask",BRASS2)
box(s,0.9,1.35,11.6,1.0,"A pilot round to one validated cluster.",40,WHITE,bold=True,font=SERIF)
box(s,0.92,2.5,11,0.8,"Pre-seed to fund the three unlocks and one government-partnered pilot — the single proof point that de-risks everything after it.",16,CREAM,line_sp=1.25,font=SERIF)
uses=[("Legal","CA + lawyer sign-off on MoR + TCS"),("Rails","Payment + payout + DigiLocker KYC"),("Pilot","One ODOP cluster / cooperative"),("Hire","A second human (reduce bus-factor)")]
for i,(h,d) in enumerate(uses):
    cx=0.9+(i%2)*5.95; cy=3.6+(i//2)*1.0
    circle(s,cx,cy,0.5,BRASS,str(i+1),WHITE,15)
    box(s,cx+0.65,cy-0.05,5.1,0.7,[(h+"  ",{"size":15,"color":WHITE,"bold":True,"font":SERIF}),(d,{"size":12.5,"color":CREAM})],14,WHITE,anchor=MSO_ANCHOR.MIDDLE)
box(s,0.9,5.95,11.6,0.7,[("Milestone: ",{"size":15,"color":BRASS2,"bold":True,"font":SERIF}),
    ("50–100 real makers transacting in one cluster, real payouts, a lawyer-cleared MoR.",{"size":15,"color":WHITE,"italic":True,"font":SERIF})],15,WHITE,line_sp=1.15)

NOTES=[
 "[EN] One line, then the MoR idea. This is pre-seed — be confident about the engine, honest about the stage.\n[HI] एक पंक्ति, फिर MoR का विचार। यह प्री-सीड है — इंजन पर आत्मविश्वास, चरण पर ईमानदारी रखें।",
 "[EN] Anchor the market at $71B, then the exclusion. The zero — no platform for the undocumented — is the opening.\n[HI] बाज़ार $71B पर टिकाएं, फिर बहिष्कार। 'शून्य — अनौपचारिक के लिए कोई मंच नहीं' ही हमारा अवसर है।",
 "[EN] MoR in one sentence, then the five moats. Stress that these are structural — incumbents can't copy without rebuilding.\n[HI] एक वाक्य में MoR, फिर पाँच मोट। ज़ोर दें कि ये संरचनात्मक हैं — प्रतिस्पर्धी बिना नए सिरे से बनाए नकल नहीं कर सकते।",
 "[EN] 81% to the maker + 12% fee + recurring subscriptions. Never-in-loss is enforced three ways.\n[HI] कारीगर को 81% + 12% शुल्क + आवर्ती सदस्यता। 'कभी घाटे में नहीं' तीन तरीकों से लागू।",
 "[EN] Show real engineering, then immediately the honest gaps. Investors back founders who name what's missing.\n[HI] असली इंजीनियरिंग दिखाएं, फिर तुरंत ईमानदार कमियाँ। निवेशक उन्हीं को समर्थन देते हैं जो कमी बताते हैं।",
 "[EN] This is the differentiator. Government isn't a risk here — it's our distribution channel.\n[HI] यही अंतर है। सरकार यहाँ जोखिम नहीं — हमारा वितरण माध्यम है।",
 "[EN] Pre-empt the 'solo founder?' worry: the AI team + hard invariants make one founder credible.\n[HI] 'अकेला संस्थापक?' की चिंता पहले ही दूर करें: AI टीम + सख़्त नियम एक संस्थापक को विश्वसनीय बनाते हैं।",
 "[EN] Make the ask and the milestone concrete. End on the one proof point that de-risks everything.\n[HI] मांग और लक्ष्य ठोस रखें। उस एक प्रमाण-बिंदु पर समाप्त करें जो सब कुछ कम-जोखिम बनाता है।",
]
for sl,nt in zip(prs.slides,NOTES): sl.notes_slide.notes_text_frame.text=nt
prs.save("/mnt/user-data/outputs/NEXUS-Investor-Deck.pptx")
print("saved NEXUS-Investor-Deck.pptx with",len(prs.slides._sldIdLst),"slides")

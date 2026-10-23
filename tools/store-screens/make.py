import json, os
P = [
 dict(id='1-sites', img='sites', l1='All your sites.', l2='One app.', sub='Stop running five sites from five diaries. Budget, progress and dues for every project — at a glance.',
      card=dict(side='left', ic='🏗️', val='4 sites', lab='live on one screen')),
 dict(id='2-profit', img='project', l1='Know what every site', l2='is really earning', sub='Most contractors find the loss after the project ends. See received, spent and due — today.',
      card=dict(side='right', ic='📈', val='₹21.50 L', lab='Still to receive')),
 dict(id='3-labour', img='labour', l1='No more', l2='muster registers', sub='Tap P · A · H · OT for every worker. Wages and dues are worked out for you.',
      card=dict(side='left', ic='👷', val='₹94,800', lab='Wages due, worked out')),
 dict(id='4-material', img='materials', l1='Material that never', l2='walks off site', sub='Every delivery on a GRN, every bag issued, every transfer tracked to the site.',
      card=dict(side='right', ic='🚚', val='GRN in 30s', lab='Delivery logged on site')),
 dict(id='5-payments', img='transactions', l1='Every rupee', l2='in and out', sub='Payment In, Payment Out and TDS — bills settled the right way, ready for your CA.',
      card=dict(side='left', ic='🧾', val='₹50,000', lab='TDS deducted — tracked')),
 dict(id='6-party', img='party', l1='Who owes you,', l2='who you owe', sub='Client, supplier, labour and contractor ledgers that balance themselves.',
      card=dict(side='right', ic='🤝', val='₹49 L', lab='Receivable from clients')),
 dict(id='7-tools', img='brick', l1='Estimate materials', l2='in seconds', sub='Bricks, concrete, steel, plaster, tiles — engineer calculators with costing, built in.',
      card=dict(side='left', ic='🧱', val='2,960 bricks', lab='9 bags cement · ₹33,808')),
]
tpl = open(os.path.join(os.path.dirname(__file__), 'poster.html')).read()
for p in P:
    html = tpl.replace('__DATA__', json.dumps(p, ensure_ascii=False))
    open(os.path.join(os.path.dirname(__file__), 'p-%s.html' % p['id']), 'w').write(html)
print(len(P))

from PIL import Image
import numpy as np
def coeffs(dst, src):
    A=[];B=[]
    for (x,y),(u,v) in zip(dst,src):
        A+=[[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]];B+=[u,v]
    return np.linalg.solve(np.array(A,float),np.array(B,float))
bg=Image.open('../keyframes/s2_spreadsheet.png').convert('RGB')
sheet=Image.open('../screens/sheet_tall.png').convert('RGB')
quad=[(49,888),(1600,1010),(1600,2440),(73,2597)]
sw=900; sh=int(sw*1.0)
src=[(0,0),(sw,0),(sw,sh),(0,sh)]
crop=sheet.crop((0,300,sw,300+sh))
c=coeffs(quad,src)
w=crop.transform(bg.size,Image.PERSPECTIVE,tuple(c),Image.BICUBIC)
m=Image.new('L',crop.size,255).transform(bg.size,Image.PERSPECTIVE,tuple(c),Image.BICUBIC)
out=bg.copy(); out.paste(w,(0,0),m); out.resize((450,800)).save('/tmp/claude-0/-home-user-truesitesync/f26823ef-610e-56f3-8941-fe9f7a255459/scratchpad/warp.png')

"""Reproduce a shared scale/translation fit against four source/reference bones. Requires numpy.
Never fits or deforms individual nerves. Residuals are vertex distances, not clinical accuracy.
"""
import pathlib,numpy as np,json,struct
root=pathlib.Path(__file__).resolve().parents[1];src=root/'sources/bodyparts3d'
def obj(p):return np.array([[float(c) for c in l.split()[1:4]] for l in p.read_text().splitlines() if l.startswith('v ')])
def glb(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);a=g['accessors'][g['meshes'][0]['primitives'][0]['attributes']['POSITION']];v=g['bufferViews'][a['bufferView']];return np.frombuffer(b,dtype='<f4',count=a['count']*3,offset=28+n+v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3).copy()
pairs=[(name,obj(next(src.glob(f'{fid}_*.obj'))),glb(root/'meshes/skull'/f'{name}.glb')) for name,fid in [('mandible','FJ3289'),('frontal_bone','FJ3200'),('maxilla_left','FJ3269'),('maxilla_right','FJ3375')]]
s=np.median(np.concatenate([(b.max(0)-b.min(0))/(a.max(0)-a.min(0)) for _,a,b in pairs]));t=np.mean([(b.max(0)+b.min(0))/2-s*(a.max(0)+a.min(0))/2 for _,a,b in pairs],axis=0)
def nearest(a,b):
 allidx=[];ds=[]
 for start in range(0,len(a),128):
  d=((a[start:start+128,None,:]-b[None,:,:])**2).sum(2);idx=d.argmin(1);allidx.extend(idx);ds.extend(d[np.arange(len(idx)),idx])
 return b[allidx],np.sqrt(ds)
print('initial',s,t,flush=True)
for it in range(15):
 xs=[];ys=[]
 for _,a,b in pairs:
  a=a[::max(1,len(a)//1200)];y,d=nearest(a*s+t,b);keep=d<=np.quantile(d,.85);xs.append(a[keep]);ys.append(y[keep])
 x=np.concatenate(xs);y=np.concatenate(ys);xc=x-x.mean(0);yc=y-y.mean(0)
 ns=(xc*yc).sum()/(xc*xc).sum();nt=y.mean(0)-ns*x.mean(0)
 if abs(ns-s)<1e-7 and np.linalg.norm(nt-t)<.0001:break
 s,t=ns,nt
print('result',s,t,flush=True)
report={'scale':float(s),'translation':t.tolist(),'referenceBones':[]}
for name,a,b in pairs:
 _,d=nearest(a*s+t,b)
 stats={'name':name,'rmsNearestVertexMm':float(np.sqrt((d*d).mean())),'medianMm':float(np.median(d)),'p95Mm':float(np.quantile(d,.95))}
 report['referenceBones'].append(stats);print(stats,flush=True)
destination=root/'data/nerve_registration.json'
previous=json.loads(destination.read_text())
previous.update(report)
destination.write_text(json.dumps(previous,indent=2)+'\n')

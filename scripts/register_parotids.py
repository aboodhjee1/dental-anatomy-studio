"""Reproduce the approximate SPL-to-mandible similarity fit; requires numpy.
This does not establish anatomical accuracy of the gland overlay.
"""
from pathlib import Path
import re,json,numpy as np,struct
root=Path(__file__).resolve().parents[1];src=root/'sources/salivary'
b=(src/'Model_25_mandible.vtk').read_bytes();m=re.search(rb'POINTS (\d+) float\n',b);x=np.frombuffer(b,dtype='>f4',count=int(m[1])*3,offset=m.end()).reshape(-1,3).astype(float);x*=np.array([-1,-1,1])
b=(root/'meshes/skull/mandible.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);a=g['accessors'][g['meshes'][0]['primitives'][0]['attributes']['POSITION']];v=g['bufferViews'][a['bufferView']];y=np.frombuffer(b,dtype='<f4',count=a['count']*3,offset=28+n+v.get('byteOffset',0)).reshape(-1,3).copy();y=np.unique(y,axis=0)
x=x[::max(1,len(x)//1000)];s=float(np.median(np.ptp(y,axis=0)/np.ptp(x,axis=0)));r=np.eye(3);t=(y.min(0)+y.max(0))/2-s*(x.min(0)+x.max(0))/2
for _ in range(25):
 z=x@r*s+t
 ds=((z[:,None,:]-y[None,:,:])**2).sum(2);idx=ds.argmin(1);dist=np.sqrt(ds[np.arange(len(x)),idx]);keep=dist<=np.quantile(dist,.9)
 aa=x[keep];bb=y[idx[keep]];ac=aa-aa.mean(0);bc=bb-bb.mean(0);u,sv,vt=np.linalg.svd(ac.T@bc);nr=u@np.diag([1,1,np.linalg.det(u@vt)])@vt;ns=np.sum((ac@nr)*bc)/np.sum(ac*ac);nt=bb.mean(0)-aa.mean(0)@nr*ns
 r,s,t=nr,float(ns),nt
print('fit',s,r,t,'residual',np.sqrt((dist*dist).mean()),np.quantile(dist,.95))
report={**json.loads((root/'data/parotid_registration.json').read_text()),'source':'SPL Head and Neck Atlas 2016-09','referenceBone':'mandible','preRotation':[-1,-1,1],'rotationRowVector':r.tolist(),'scale':s,'translation':t.tolist(),'rmsNearestVertexMm':float(np.sqrt((dist*dist).mean())),'p95Mm':float(np.quantile(dist,.95)),'limitation':'Different atlas specimen. Uniform similarity fit against mandible only; approximate educational overlay, not validation of gland placement.'}
(root/'data/parotid_registration.json').write_text(json.dumps(report,indent=2)+'\n')

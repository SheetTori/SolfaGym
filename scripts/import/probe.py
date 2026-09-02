from music21 import converter, note, key, meter

s = converter.parse('banzai.xml')
print('parts:', len(s.parts))
print('atSoundingPitch:', s.atSoundingPitch)
ks = s.recurse().getElementsByClass(key.KeySignature)
print('keysigs:', [(k.sharps, getattr(k, 'mode', None)) for k in ks])
ts = s.recurse().getElementsByClass(meter.TimeSignature)
print('timesigs:', [t.ratioString for t in ts])

notes = list(s.recurse().notes)
print('n notes:', len(notes))
print('spellingIsInferred any:', any(n.pitch.spellingIsInferred for n in notes))
for n in notes[:8]:
    p = n.pitch
    print(f'  {p.nameWithOctave:6s} step={p.step} alter={p.accidental.alter if p.accidental else 0} oct={p.octave} ql={float(n.duration.quarterLength)} inferred={p.spellingIsInferred}')
# fis があるか（綴りが保たれているか）
sharps = [n.pitch.nameWithOctave for n in notes if n.pitch.accidental and n.pitch.accidental.alter != 0]
print('accidentals:', sharps[:6])
print('last note:', notes[-1].pitch.nameWithOctave)
try:
    k = s.analyze('key')
    print('analyze(key):', k, 'corr=', round(k.correlationCoefficient, 3))
except Exception as e:
    print('analyze failed:', e)

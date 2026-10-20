# Confere uma atestação pós-quântica com uma implementação INDEPENDENTE do FIPS 205 (pacote PyPI "slh-dsa", em Python),
# reconstruindo a mensagem só a partir do formato documentado. Opcional: precisa de  pip install slh-dsa
# Uso:  python3 -I scripts/pq-cruzar.py kit/pq/exemplo-teste.json
import hashlib, json, sys
import slhdsa

a = json.load(open(sys.argv[1], encoding='utf-8'))
assert a['schema'] == 'orum-pq-atestacao/v1' and a['algoritmo'] == 'SLH-DSA-SHAKE-128s' and a['contexto'] == 'ORUM-ATESTACAO-PQ/v1'
linhas = [a['contexto'], f"tipo: {a['tipo']}", f"algoritmo: {a['algoritmo']}", f"chave_publica: {a['chave_publica']}", f"commit_base: {a['commit_base']}"]
for f in sorted(a['ficheiros'], key=lambda f: f['caminho'].encode()):
    linhas.append(f"{f['caminho']}\t{f['sha256']}\t{f['sha3_256']}")
msg = ('\n'.join(linhas) + '\n').encode()
assert hashlib.sha256(msg).hexdigest() == a['mensagem_sha256'], 'mensagem_sha256 não bate'
pk = slhdsa.PublicKey.from_digest(bytes.fromhex(a['chave_publica']), slhdsa.shake_128s)
sig = bytes.fromhex(a['assinatura'])
ok = pk.verify_pure(msg, sig, a['contexto'].encode())
print(json.dumps({'ficheiro': sys.argv[1], 'tipo': a['tipo'], 'implementacao': 'slh-dsa (Python, independente)', 'assinatura_bytes': len(sig), 'verifica': ok,
                  'rejeita_mensagem_alterada': not pk.verify_pure(msg + b'x', sig, a['contexto'].encode()),
                  'rejeita_outro_contexto': not pk.verify_pure(msg, sig, b'outro')}))
sys.exit(0 if ok else 1)

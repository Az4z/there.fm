#!/usr/bin/env python3
"""
Baixa e prepara o ícone do app.

Trocamos o ImageMagick por Python porque os runners novos do Ubuntu não trazem
mais o comando 'convert' instalado (era esse o erro 'command not found').

O que faz: pega a imagem, encaixa dentro de um quadrado de 1024x1024 sem
distorcer nem cortar, e preenche a sobra com preto (combina com o tema escuro
do app). O gerador de ícones do Android exige exatamente esse formato.
"""
import os, sys, urllib.request

ORIGEM = 'assets/icon.png'
LADO = 1024
FUNDO = (0, 0, 0, 255)   # preto

def baixar(url, destino):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r, open(destino, 'wb') as f:
        f.write(r.read())

def preparar(origem, destino):
    from PIL import Image
    img = Image.open(origem).convert('RGBA')
    largura, altura = img.size

    # escala para caber inteira no quadrado, mantendo a proporção
    escala = min(LADO / largura, LADO / altura)
    nova = (max(1, round(largura * escala)), max(1, round(altura * escala)))
    img = img.resize(nova, Image.LANCZOS)

    fundo = Image.new('RGBA', (LADO, LADO), FUNDO)
    fundo.paste(img, ((LADO - nova[0]) // 2, (LADO - nova[1]) // 2), img)
    fundo.convert('RGB').save(destino, 'PNG')
    print('ícone pronto: %dx%d (original era %dx%d)' % (LADO, LADO, largura, altura))

if __name__ == '__main__':
    url = os.environ.get('ICON_URL', '').strip()
    os.makedirs('assets', exist_ok=True)

    # um arquivo enviado ao repositório tem prioridade sobre a URL
    if os.path.exists(ORIGEM):
        entrada = ORIGEM
        print('usando assets/icon.png do repositório')
    elif url:
        entrada = '/tmp/icone-original'
        try:
            baixar(url, entrada)
            print('imagem baixada')
        except Exception as e:
            print('não consegui baixar o ícone:', e)
            sys.exit(0)      # segue o build com o ícone padrão
    else:
        print('nenhuma imagem definida — ícone padrão')
        sys.exit(0)

    try:
        preparar(entrada, ORIGEM)
    except Exception as e:
        print('não consegui preparar a imagem:', e)
        sys.exit(0)          # nunca derruba o build por causa do ícone

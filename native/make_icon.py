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
    """
    PREENCHE o quadrado com a imagem, cortando o excesso.

    Antes eu fazia o contrário: encaixava a imagem inteira dentro do quadrado,
    o que deixava barras pretas em cima e embaixo numa foto horizontal — o ícone
    ficava com a foto espremida numa faixa. Para ícone, o certo é preencher:
    a imagem cobre todo o quadrado e o que sobra nas laterais é cortado,
    mantendo a proporção original (nada é esticado).
    """
    from PIL import Image
    img = Image.open(origem).convert('RGB')
    largura, altura = img.size

    # max (e não min): garante que a imagem cubra o quadrado inteiro
    escala = max(LADO / largura, LADO / altura)
    nova = (max(LADO, round(largura * escala)), max(LADO, round(altura * escala)))
    img = img.resize(nova, Image.LANCZOS)

    # recorta o centro — é onde quase sempre está o assunto da foto
    esq = (nova[0] - LADO) // 2
    topo = (nova[1] - LADO) // 2
    img = img.crop((esq, topo, esq + LADO, topo + LADO))
    img.save(destino, 'PNG')
    print('ícone pronto: %dx%d preenchido (original era %dx%d)' % (LADO, LADO, largura, altura))

def achar_imagem_local():
    """
    Procura qualquer imagem dentro de assets/, com qualquer nome.

    Isso existe porque, pelo celular, o GitHub não deixa renomear o arquivo na
    hora de enviar nem depois (imagens não são editáveis pela web). Exigir o nome
    exato 'icon.png' tornaria o envio quase impossível sem um computador.
    Se houver mais de uma imagem, a que se chamar 'icon' tem preferência.
    """
    if not os.path.isdir('assets'):
        return None
    validas = ('.png', '.jpg', '.jpeg', '.webp', '.bmp')
    achadas = [f for f in sorted(os.listdir('assets'))
               if f.lower().endswith(validas)]
    if not achadas:
        return None
    preferida = [f for f in achadas if os.path.splitext(f)[0].lower() == 'icon']
    escolhida = (preferida or achadas)[0]
    print('imagem encontrada em assets/:', escolhida)
    return os.path.join('assets', escolhida)

if __name__ == '__main__':
    url = os.environ.get('ICON_URL', '').strip()
    os.makedirs('assets', exist_ok=True)

    # uma imagem enviada ao repositório tem prioridade sobre a URL
    local = achar_imagem_local()
    if local:
        entrada = local
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
        # lê de onde estiver, mas grava sempre como assets/icon.png,
        # que é o nome que o gerador de ícones do Android espera
        preparar(entrada, ORIGEM)
    except Exception as e:
        print('não consegui preparar a imagem:', e)
        sys.exit(0)          # nunca derruba o build por causa do ícone

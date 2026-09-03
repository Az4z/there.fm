#!/usr/bin/env python3
"""
Aplica o plugin nativo e as permissões ao projeto Android.

Precisa rodar DEPOIS do 'npx cap add android', porque esse comando regenera a
pasta android/ inteira a cada build — qualquer alteração feita antes seria
apagada.
"""
import os, shutil, sys

PKG = 'android/app/src/main/java/fm/there/app'
GRADLE = 'android/app/build.gradle'
MANIFEST = 'android/app/src/main/AndroidManifest.xml'

def copiar_plugin():
    os.makedirs(PKG, exist_ok=True)
    for arquivo in ('TheaterPlugin.java', 'MainActivity.java'):
        origem = os.path.join('native', arquivo)
        if not os.path.exists(origem):
            print('ERRO: não encontrei', origem); sys.exit(1)
        shutil.copy(origem, os.path.join(PKG, arquivo))
        print('copiado:', arquivo)

def adicionar_dependencia():
    # androidx.webkit permite injetar o detector também dentro dos quadros
    # internos da página (muitos sites põem o player num iframe próprio)
    with open(GRADLE) as f: s = f.read()
    if 'androidx.webkit' in s:
        print('dependência já presente'); return
    s = s.replace('dependencies {',
                  "dependencies {\n    implementation 'androidx.webkit:webkit:1.11.0'", 1)
    with open(GRADLE, 'w') as f: f.write(s)
    print('dependência androidx.webkit adicionada')

def adicionar_permissoes():
    with open(MANIFEST) as f: s = f.read()
    perms = [
        'android.permission.RECORD_AUDIO',            # chamada de voz
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.CAMERA',
        'android.permission.FOREGROUND_SERVICE',      # impede o Android de matar
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',  # a voz em segundo plano
    ]
    novas = [p for p in perms if p not in s]
    if not novas:
        print('permissões já presentes'); return
    bloco = ''.join('    <uses-permission android:name="%s"/>\n' % p for p in novas)
    s = s.replace('<application', bloco + '\n    <application', 1)
    with open(MANIFEST, 'w') as f: f.write(s)
    print('permissões adicionadas:', len(novas))

if __name__ == '__main__':
    copiar_plugin()
    adicionar_dependencia()
    adicionar_permissoes()
    print('projeto Android preparado')

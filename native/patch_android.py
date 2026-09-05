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
    for arquivo in ('TheaterPlugin.java', 'MainActivity.java',
                    'AdBlock.java', 'PlaybackService.java'):
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

def configurar_assinatura():
    """
    Faz o app ser assinado SEMPRE com a mesma chave.

    Sem isto, cada build gera uma assinatura diferente e o Android recusa
    instalar a nova versão por cima da anterior ("App not installed"), porque
    trata assinaturas distintas como apps de origens distintas. Com uma chave
    fixa, atualizar passa a funcionar normalmente e seus dados são mantidos.
    """
    ks = 'keystore/there.jks'
    if not os.path.exists(ks):
        print('sem keystore — build sairá com assinatura temporária'); return
    with open(GRADLE) as f: s = f.read()
    if 'thereSigning' in s:
        print('assinatura já configurada'); return

    bloco = """
    signingConfigs {
        thereSigning {
            storeFile file('../../keystore/there.jks')
            storePassword 'therefm'
            keyAlias 'there'
            keyPassword 'therefm'
        }
    }
"""
    s = s.replace('android {', 'android {' + bloco, 1)
    # aplica a chave fixa também na variante de depuração, que é a que geramos
    s = s.replace('buildTypes {',
                  "buildTypes {\n        debug { signingConfig signingConfigs.thereSigning }", 1)
    with open(GRADLE, 'w') as f: f.write(s)
    print('assinatura fixa configurada')

def registrar_servico():
    """
    Declara o serviço de reprodução no manifesto.

    Sem esta declaração o Android recusa iniciar o serviço e o áudio continua
    morrendo ao sair da tela — o código Java sozinho não basta, o sistema exige
    que o serviço esteja declarado.
    """
    with open(MANIFEST) as f: s = f.read()
    if 'PlaybackService' in s:
        print('serviço já declarado'); return
    servico = (
        '        <service\n'
        '            android:name=".PlaybackService"\n'
        '            android:enabled="true"\n'
        '            android:exported="false"\n'
        '            android:foregroundServiceType="mediaPlayback" />\n'
    )
    # entra logo antes do fechamento de <application>
    s = s.replace('</application>', servico + '    </application>', 1)
    with open(MANIFEST, 'w') as f: f.write(s)
    print('serviço de segundo plano declarado')

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
    configurar_assinatura()
    adicionar_permissoes()
    registrar_servico()
    print('projeto Android preparado')

import * as vscode from 'vscode';
import * as cp from 'child_process';

// VPN 프로세스 관리를 위한 전역 변수
let vpnProcess: cp.ChildProcess | undefined;
let statusBarItem: vscode.StatusBarItem;
let isConnected = false;

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenFortiVPN Connector가 활성화되었습니다.');

    // 상태 표시줄 아이템 생성
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(shield) VPN: 해제됨";
    statusBarItem.command = 'openfortivpn-connector.toggle';
    statusBarItem.tooltip = "OpenFortiVPN 연결 토글";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // 설정 명령어 등록
    let configCommand = vscode.commands.registerCommand('openfortivpn-connector.config', async () => {
        await configureVPN();
    });

    // 토글 명령어 등록
    let toggleCommand = vscode.commands.registerCommand('openfortivpn-connector.toggle', () => {
        if (isConnected) {
            disconnectVPN();
        } else {
            connectVPN();
        }
    });

    context.subscriptions.push(configCommand, toggleCommand);

    // 상태 확인 인터벌 설정
    setInterval(checkVPNStatus, 10000);
}

// VPN 설정 함수
async function configureVPN() {
    // 현재 설정 가져오기
    const config = vscode.workspace.getConfiguration('openfortivpn-connector');
    
    // 호스트 설정
    const host = await vscode.window.showInputBox({
        prompt: 'VPN 게이트웨이 주소를 입력하세요',
        value: config.get('host') as string
    });
    
    if (host !== undefined) {
        await config.update('host', host, vscode.ConfigurationTarget.Global);
    } else {
        return; // 사용자가 취소함
    }
    
    // 포트 설정
    const port = await vscode.window.showInputBox({
        prompt: 'VPN 게이트웨이 포트를 입력하세요',
        value: config.get('port') as string || '443'
    });
    
    if (port !== undefined) {
        await config.update('port', port, vscode.ConfigurationTarget.Global);
    }
    
    // 사용자 이름 설정
    const username = await vscode.window.showInputBox({
        prompt: '사용자 이름을 입력하세요',
        value: config.get('username') as string
    });
    
    if (username !== undefined) {
        await config.update('username', username, vscode.ConfigurationTarget.Global);
    }
    
    vscode.window.showInformationMessage('OpenFortiVPN 설정이 저장되었습니다.');
}

// VPN 연결 함수
async function connectVPN() {
    // 설정 확인
    const config = vscode.workspace.getConfiguration('openfortivpn-connector');
    const host = config.get('host') as string;
    const port = config.get('port') as string;
    const username = config.get('username') as string;
    
    if (!host || !username) {
        const setup = await vscode.window.showWarningMessage(
            'OpenFortiVPN 설정이 필요합니다.', 
            '설정하기'
        );
        
        if (setup === '설정하기') {
            await configureVPN();
            return;
        } else {
            return;
        }
    }
    
    // 비밀번호 입력
    const password = await vscode.window.showInputBox({
        prompt: 'VPN 비밀번호를 입력하세요',
        password: true
    });
    
    if (!password) {
        return; // 사용자가 취소함
    }
    
    try {
        const hostWithPort = port ? `${host}:${port}` : host;
        
        // 터미널 생성
        const terminal = vscode.window.createTerminal('OpenFortiVPN');
        terminal.show();
        
        // 방법 1: 두 단계로 비밀번호를 처리하는 방식
        terminal.sendText(`sudo openfortivpn ${hostWithPort} -u ${username}`);
        
        // 약간의 지연 후 비밀번호 입력 (비밀번호 프롬프트가 나타날 시간을 줌)
        setTimeout(() => {
            terminal.sendText(password);
        }, 1000);
        
        // 상태 업데이트
        isConnected = true;
        statusBarItem.text = "$(shield) VPN: 연결 중...";
        
        // 연결 확인 시작 (비밀번호 입력 후 시간을 더 줌)
        setTimeout(checkVPNStatus, 5000);
        
        vscode.window.showInformationMessage('OpenFortiVPN 연결 시도 중...');
    } catch (error) {
        vscode.window.showErrorMessage(`VPN 연결 실패: ${error}`);
    }
}

// VPN 연결 해제 함수
function disconnectVPN() {
    try {
        // 터미널 생성
        const terminal = vscode.window.createTerminal('OpenFortiVPN');
        terminal.show();
        
        // sudo pkill 명령어 실행
        terminal.sendText('sudo pkill -SIGTERM openfortivpn');
        
        // 상태 업데이트
        isConnected = false;
        statusBarItem.text = "$(shield) VPN: 해제됨";
        
        vscode.window.showInformationMessage('OpenFortiVPN 연결이 해제되었습니다.');
    } catch (error) {
        vscode.window.showErrorMessage(`VPN 연결 해제 실패: ${error}`);
    }
}

// VPN 상태 확인 함수
function checkVPNStatus() {
    // macOS와 Linux에서 작동하는 명령어
    const command = 'ip addr show ppp0 2>/dev/null || ifconfig ppp0 2>/dev/null';
    
    cp.exec(command, (error, stdout) => {
        if (error || !stdout) {
            // ppp0 인터페이스가 없으면 VPN이 연결되지 않은 상태
            if (isConnected) {
                isConnected = false;
                statusBarItem.text = "$(shield) VPN: 해제됨";
                vscode.window.showWarningMessage('OpenFortiVPN 연결이 끊어졌습니다.');
            }
        } else {
            // ppp0 인터페이스가 있으면 VPN이 연결된 상태
            if (!isConnected) {
                isConnected = true;
                statusBarItem.text = "$(shield) VPN: 연결됨";
                vscode.window.showInformationMessage('OpenFortiVPN 연결이 확인되었습니다.');
            } else {
                statusBarItem.text = "$(shield) VPN: 연결됨";
            }
        }
    });
}

// 확장 프로그램 비활성화 시 호출
export function deactivate() {
    // VPN 연결 해제
    if (isConnected) {
        disconnectVPN();
    }
}
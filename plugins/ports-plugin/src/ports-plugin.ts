/*********************************************************************
 * Copyright (c) 2019 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 **********************************************************************/

import * as theia from '@theia/plugin';
import { PortChangesDetector } from './port-changes-detector';
import { Port } from './port';
import { WorkspaceHandler } from './workspace-handler';
import { PortRedirectListener } from './port-redirect-listener';
import { WorkspacePort } from './workspace-port';

/**
 * Plugin that is monitoring new port being opened and closed.
 * Check README file for more details
 * @author Florent Benoit
 */

// constants
const LISTEN_ALL_IPV4 = '0.0.0.0';
const LISTEN_ALL_IPV6 = '::';
const SERVER_REDIRECT_PATTERN = 'theia-redirect-';

// variables
let workspacePorts: WorkspacePort[];
let redirectPorts: WorkspacePort[];

export interface MessageItem {
    title: string;
}

/**
 * Prompt user to create a port redirect for the specific port
 * @param port the port that needs to be redirected
 * @param redirectMessage the message if there are 'free ports' in workspace
 * @param errorMessage  if no free port are available
 */
async function askRedirect(port: Port, redirectMessage: string, errorMessage: string) {

    // grab a free redirect
    if (redirectPorts.length === 0) {
        await theia.window.showErrorMessage(errorMessage, { modal: true });
        return;
    }

    const interactions: MessageItem[] = [{ title: 'yes' }];
    const result = await theia.window.showInformationMessage(redirectMessage, { modal: true }, ...interactions);
    if (result && result.title === 'yes') {
        // takes first available port
        const workspacePort = redirectPorts.pop()!;

        // start a new listener
        const portRedirectListener = new PortRedirectListener(parseInt(workspacePort.portNumber, 10), 'localhost', port.portNumber);
        portRedirectListener.start();

        // show redirect
        const redirectInteractions: MessageItem[] = [{ title: 'Open Link' }];
        const msg = `Redirect is now enabled on port ${port.portNumber}. External URL is ${workspacePort.url}`;
        const resultShow = await theia.window.showInformationMessage(msg, { modal: true }, ...redirectInteractions);
        if (resultShow && resultShow.title === 'Open Link') {
            theia.commands.executeCommand('mini-browser.openUrl', workspacePort.url);
        }
    }
}

// Callback when a new port is being opened in workspace
async function onOpenPort(port: Port) {

    // if not listening on 0.0.0.0 then raise a prompt to add a port redirect
    if (port.interfaceListen !== LISTEN_ALL_IPV4 && port.interfaceListen !== LISTEN_ALL_IPV6) {
        const desc = `A new process is now listening on port ${port.portNumber} but is listening on interface ${port.interfaceListen} which is internal.
        You should change to be remotely available. Would you want to add a redirect for this port so it becomes available ?`;
        const err = `A new process is now listening on port ${port.portNumber} but is listening on interface ${port.interfaceListen} which is internal.
        This port is not available outside. You should change the code to listen on 0.0.0.0 for example.`;
        await askRedirect(port, desc, err);
        return;
    }

    // check now if the port is in workspace definition ?
    const matchingWorkspacePort = workspacePorts.find(workspacePort => workspacePort.portNumber === port.portNumber.toString());

    // if there, show prompt
    if (matchingWorkspacePort) {

        // internal stuff, no need to display anything
        if (matchingWorkspacePort.serverName.startsWith(SERVER_REDIRECT_PATTERN)) {
            return;
        }
        const interactions: MessageItem[] = [{ title: 'Open Link' }];
        const msg = `A process is now listening on port ${matchingWorkspacePort.portNumber}. External URL is ${matchingWorkspacePort.url}`;
        const result = await theia.window.showInformationMessage(msg, { modal: true }, ...interactions);
        if (result && result.title === 'Open Link') {
            theia.commands.executeCommand('mini-browser.openUrl', matchingWorkspacePort.url);
        }
    } else {
        // TODO: here need to use a pre-defined port and hook it with custom listener
        const desc = `A new process is now listening on port ${port.portNumber} but this port is not exposed in the workspace as a server.
         Would you want to add a redirect for this port so it becomes available ?`;
        const err = `A new process is now listening on port ${port.portNumber} but this port is not exposed in the workspace as a server.
         You should add a new server with this port in order to access it`;
        await askRedirect(port, desc, err);
    }
    console.info(`The port ${port.portNumber} is now listening on interface ${port.interfaceListen}`);
}

function onClosedPort(port: Port) {
    // only do a trace
    console.info(`The port ${port.portNumber} is no longer listening on interface ${port.interfaceListen}`);
}

export async function start(context: theia.PluginContext): Promise<void> {

    // first, grab ports of workspace
    const workspaceHandler = new WorkspaceHandler();
    workspacePorts = await workspaceHandler.getWorkspacePorts();

    redirectPorts = workspacePorts.filter(port => port.serverName.startsWith(SERVER_REDIRECT_PATTERN));

    const portChangesDetector = new PortChangesDetector();
    portChangesDetector.onDidOpenPort(onOpenPort);
    portChangesDetector.onDidClosePort(onClosedPort);

    // start port changes
    portChangesDetector.init();
    portChangesDetector.check();

}

export function stop() {

}
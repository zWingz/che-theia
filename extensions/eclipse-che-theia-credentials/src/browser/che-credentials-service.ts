/**********************************************************************
 * Copyright (c) 2019-2020 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 ***********************************************************************/

import * as k8s from '@kubernetes/client-node';

import { CredentialsChangeEvent, CredentialsService } from '@theia/core/lib/browser/credentials-service';
import { Emitter, Event } from '@theia/core';

import { CheK8SServiceImpl } from '@eclipse-che/theia-remote-impl-che-server/lib/node/che-server-k8s-service-impl';
import { CheServerWorkspaceServiceImpl } from '@eclipse-che/theia-remote-impl-che-server/lib/node/che-server-workspace-service-impl';
import { inject } from 'inversify';

// Che implementation of the {@link CredentialsService} based on kubernetes secrets.
export class CheCredentialsService implements CredentialsService {
  @inject(CheK8SServiceImpl)
  private readonly cheK8SService: CheK8SServiceImpl;

  @inject(CheServerWorkspaceServiceImpl)
  private readonly workspaceService: CheServerWorkspaceServiceImpl;

  private readonly onDidChangePasswordEmitter = new Emitter<CredentialsChangeEvent>();
  readonly onDidChangePassword: Event<CredentialsChangeEvent> = this.onDidChangePasswordEmitter.event;

  async deletePassword(service: string, account: string): Promise<boolean> {
    try {
      await this.cheK8SService
        .makeApiClient(k8s.CoreV1Api)
        .deleteNamespacedSecret(`${service}_${account}`, await this.getWorkspaceId());
      this.onDidChangePasswordEmitter.fire({ service, account });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
    const secrets = await this.cheK8SService
      .makeApiClient(k8s.CoreV1Api)
      .listNamespacedSecret(await this.getWorkspaceId());
    return secrets.body.items
      .filter(secret => secret.metadata && secret.metadata.name && secret.metadata.name.startsWith(service))
      .map(secret => ({
        account: secret.metadata!.name!.substring(service.length + 1),
        password: secret.data!.password,
      }));
  }

  async findPassword(service: string): Promise<string | undefined> {
    const secrets = await this.cheK8SService
      .makeApiClient(k8s.CoreV1Api)
      .listNamespacedSecret(await this.getWorkspaceId());
    const item = secrets.body.items.find(
      secret => secret.metadata && secret.metadata.name && secret.metadata.name.startsWith(service)
    );
    if (item) {
      return item.data!.password;
    }
  }

  async getPassword(service: string, account: string): Promise<string | undefined> {
    const secrets = await this.cheK8SService
      .makeApiClient(k8s.CoreV1Api)
      .listNamespacedSecret(await this.getWorkspaceId());
    const item = secrets.body.items.find(
      secret => secret.metadata && secret.metadata.name && secret.metadata.name.startsWith(service)
    );
    if (item) {
      return item.data!.password;
    }
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    await this.cheK8SService.makeApiClient(k8s.CoreV1Api).createNamespacedSecret(await this.getWorkspaceId(), {
      data: { password },
      metadata: { name: `${service}_${account}` },
    });
    this.onDidChangePasswordEmitter.fire({ service, account });
  }

  private async getWorkspaceId(): Promise<string> {
    // grab current workspace
    const workspace = await this.workspaceService.currentWorkspace();
    return workspace.id || '';
  }
}

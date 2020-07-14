import { AppRegistry } from "@connext/types";
import { Controller, Get } from "@nestjs/common";

import { CFCoreService } from "../cfCore/cfCore.service";

@Controller("api/app-registry")
export class AppRegistryController {
  constructor(private readonly cfCoreService: CFCoreService) {}

  @Get()
  async get(): Promise<AppRegistry> {
    return this.cfCoreService.getAppRegistry();
  }
}

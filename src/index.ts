import { Observable } from "rxjs";
import http from "http";
import { AccessEntry, RelationshipChange, User } from "./models";

function printCache(cache: Map<string, Set<string>>) {
  cache.forEach((value, key) => {
    console.log({ key, value: new Array(...value.values()) });
  })
}

export class AuthorizationService {
  private SERVICE_BACKEND_URL: string = "http://my-service.com";
  private PRODUCT_CATEGORIES: string = "/product/{product_name}/categories";
  private CATEGORIES_GROUPS: string = "/category/{category_name}/groups";

  // private accessMap: Map<string, Set<string>> = new Map();
  private accesses: AccessEntry[];
  private productCategoryCache: Map<string, Set<string>> = new Map();
  private categoryGroupCache: Map<string, Set<string>> = new Map();

  constructor(private relationShipEvents: Observable<RelationshipChange>) {
    this.accesses = [];
    // TBD
    relationShipEvents.subscribe({
      next: (change: RelationshipChange) => {
        switch (change.type) {
          case "category": {
            const category = change.item;
            const group = change.parent;
            const categoryGroups = this.categoryGroupCache.get(category);
            // console.log(`subscribe change ${change}, categoryGroupCache: ${this.categoryGroupCache}`);
            if (change.action === "add") {
              categoryGroups?.add(group);
            } else if (change.action === "delete") {
              categoryGroups?.delete(group);
            }
            break;
          }
          case "product": {
            const product = change.item;
            const category = change.parent;
            const productCategories = this.productCategoryCache.get(product);
            if (change.action === "delete") {
              productCategories?.delete(category);
            } else if (change.action === "add") {
              productCategories?.add(category);
            }
            break;
          }
          default:
            break;
        }
      }
    })
  }

  public async setAccess(accesses: AccessEntry[]) {
    this.accesses = accesses;
    this.accesses.forEach((accessRule) => {
      switch (accessRule.type) {
        case "category": 
          accessRule.allowed.forEach((category) => {
            if (!this.isCategoryCached(category)) {
              this.fetchAndCacheCategory(category);
            }
          });
          break;
        case "product":
          accessRule.allowed.forEach((product) => {
            if (!this.isProductCached(product)) {
              this.fetchAndCacheProduct(product);
            }
          });
          break;
        default:
          break;
      }
    });
    console.log('Category Group Cache');
    printCache(this.categoryGroupCache);

    console.log('Product Category Cache');
    printCache(this.productCategoryCache);
  }

  public hasAccess(user: User, path: string) {
    const access = this.accesses.find((access) => access.path === path);
    // console.log({ access });
    if (!access) {
      return true;
    }
    if (access.type === "group") {
      return user.groups.some((group) => group in access.allowed);
    }
    if (access.type === "category") {
      return access.allowed.some((category) => {
        // const categoryGroups = this.getCategoryGroups(category);
        const categoryGroups = this.categoryGroupCache.get(category);
        const userInGroup = user.groups.some((group) => categoryGroups?.has(group));
        // console.log({ category, categoryGroups, user, userInGroup });
        return userInGroup;
      });
    }
    if (access.type === "product") {
      return access.allowed.some((product) => {
        // const productGroups = this.getProductGroups(product);
        const productGroups = this.productCategoryCache.get(product);
        // console.log({ productGroups });
        return user.groups.some((group) => productGroups?.has(group));
      });
    }
  }

  private isCategoryCached(category: string) {
    return this.categoryGroupCache.has(category);
  }

  private isProductCached(product: string) {
    return this.productCategoryCache.has(product);
  }

  private getProductGroups(product: string) {
    // // TBD ...
    let productCategories: Set<string>;
    if (this.productCategoryCache.has(product)) {
      productCategories =
        this.productCategoryCache.get(product) ?? new Set<string>([]);
    } else {
      productCategories = new Set<string>(this.fetchProduct(product));
    }

    let productGroups: Set<string> = new Set<string>([]);
    productCategories.forEach((category) => {
      productGroups = new Set<string>([
        ...productGroups,
        ...this.getCategoryGroups(category),
      ]);
    });
    console.log({ productGroups: new Array(...productGroups.values()) });
    return productGroups;
  }

  private getCategoryGroups(category: string) {
    if (this.categoryGroupCache.has(category)) {
      return this.categoryGroupCache.get(category) ?? new Set<string>([]);
    }
    return this.fetchAndCacheCategory(category);
  }

  private fetchAndCacheCategory(category: string) {
    const categoryGroups = this.fetchCategory(category);
    const categoryGroupsSet = new Set<string>(categoryGroups);
    this.categoryGroupCache.set(category, categoryGroupsSet);
    return categoryGroupsSet;
  }

  private fetchAndCacheProduct(product: string) {
    const productCategories = this.fetchProduct(product);
    const productCategorySet = new Set<string>(productCategories);
    this.productCategoryCache.set(product, productCategorySet);
    return productCategorySet;
  }

  private fetchCategory(category: string) {
    if (category === "balls") {
      return ["group-a-1", "group-b"];
    }
    if (category === "toys") {
      return ["group-b", "group-c"];
    }
  }

  private fetchProduct(product: string) {
    if (product === "soccerBall") {
      return ["toys", "balls", "sport"];
    }
    if (product === "teddyBear") {
      return ["toys"];
    }
  }
}

const observable = new Observable<RelationshipChange>((subscriber) => {
  subscriber.next({
    action: "delete",
    type: "product",
    item: "teddyBear",
    parent: "toys",
    //removes product "teddyBear` from the category "toys"
  });
  // subscriber.next({
  //   action: "delete",
  //   type: "category",
  //   item: "balls",
  //   parent: "group-b",
  //   //gives users of "group-a" access to the category "toys"
  // });
  // subscriber.next(3);
  setTimeout(() => {
    subscriber.next({
      action: "delete",
      type: "category",
      item: "balls",
      parent: "group-b",
      //gives users of "group-a" access to the category "toys"
    });
    subscriber.complete();
  }, 1000);
});

const userB: User = { groups: ["group-b"] };

const myAuthService = new AuthorizationService(observable);

myAuthService.setAccess([
  {
    path: "/landing-page-for-client-a",
    type: "group",
    allowed: ["group-a-1", "group-a-2"],
  },
  { path: "/categories/balls", type: "category", allowed: ["balls"] }, //translates to groups ["group-a-1
  { path: "/products/soccerBall", type: "product", allowed: ["soccerBall"] }, //translates to groups ["gr
]);

console.log(`hasAccess for /landing-page-for-client-a`, myAuthService.hasAccess(userB, "/landing-page-for-client-a")); // false (because userB doesn't belong to gr
console.log(`hasAccess for "/categories/balls"`, myAuthService.hasAccess(userB, "/categories/balls")); // true (because userB belongs to group-b which has a
console.log(`hasAccess for "/products/soccerBall"`, myAuthService.hasAccess(userB, "/products/soccerBall")); // true
setTimeout(() => {
  console.log(`after 2000ms hasAccess for "/categories/balls"`, myAuthService.hasAccess(userB, "/categories/balls")); // false (because userB belongs to group-b which has a
}, 2000);
